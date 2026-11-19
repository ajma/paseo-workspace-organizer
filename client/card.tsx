// A workspace row in the style of Paseo's own list: an icon, a one-line title with its time, then the chosen fields on
// one line joined by "·", labels, and notes. Resting on a field opens every detail beside the row.
import { Icon } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { formatDuration } from "../shared/activity";
import { limitLabels, type CardField, type LabelLimit, type TitleLines } from "../shared/cards";
import { identityText, identityTint, isDarkSurface } from "../shared/identity-colors";
import { detailExtras, fieldItems, palette, statusColor, type CardModel, type FieldItem, type Piece } from "./card-fields";
import type { Theme } from "./controls";
import { pascal } from "./lucide";
import { CardHoverProvider, Tip, useCardHover, useCardHoverControls } from "./tooltip";
import { useDragging } from "./drag";
import { ARCHIVE_CONFIRM_MS } from "../shared/archive";
import { Glow, Pulse, Spin } from "./motion";
import { font } from "./typography";
import { canFloat, showFloatingPanel, type PanelLine } from "./web";

export { displayPath, statusColor, type CardLink, type CardModel } from "./card-fields";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });
const metaFont = font.sm;
const metaIcon = font.sm;
const separatorGutter = 14;

// What the hover buttons and ⋯ menu can do for a live workspace. The settings preview passes none.
export type CardActions = {
  onArchive: () => void; pinned: boolean; onTogglePin?: () => void;
  onEdit?: () => void; onRename?: () => void; onCopyPath?: () => void; onCopyBranch?: () => void;
};

// React Native Web reports hover in Pressable's style callback; React Native's types do not include it.
const isHovered = (state: object) => Boolean((state as { hovered?: boolean }).hovered);

// Counts up each second while a run is in progress; only running rows tick.
function LiveElapsed({ since, color }: { since: number; color: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const elapsed = formatDuration(Math.max(0, now - since));
  return <Text accessibilityLabel={`Running for ${elapsed}`} style={{ color, fontSize: metaFont }}>{elapsed}</Text>;
}

function PieceView({ piece, wrap, underline = false }: { piece: Piece; wrap: boolean; underline?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1, minWidth: 0 }}>
    {piece.svg ? <Icon icon={{ svg: piece.svg }} size={metaIcon} color={piece.color} />
      : piece.icon ? <Spin on={Boolean(piece.spin)}><Icon name={pascal(piece.icon)} size={metaIcon} color={piece.color} /></Spin> : null}
    {piece.dot ? <View accessibilityLabel="Uncommitted changes" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: piece.color }} /> : null}
    {piece.liveSince !== undefined ? <LiveElapsed since={piece.liveSince} color={piece.color} />
      : piece.text ? <Text numberOfLines={wrap ? undefined : 1} style={{ color: piece.color, fontSize: metaFont, flexShrink: 1,
        fontWeight: piece.bold ? "600" : "400", fontFamily: piece.mono ? mono : undefined,
        textDecorationLine: underline ? "underline" : "none" }}>{piece.text}</Text> : null}
  </View>;
}

export function FieldView({ item, wrap = false, underline = false }: { item: FieldItem; wrap?: boolean; underline?: boolean }) {
  return <View accessibilityLabel={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0,
    flexWrap: wrap ? "wrap" : "nowrap" }}>
    {/* A hovered link underlines its number and state (its first piece) to show it can be clicked. */}
    {item.pieces.map((piece, index) => <PieceView key={index} piece={piece} wrap={wrap} underline={underline && index === 0} />)}
  </View>;
}

// Paseo labels keep their color: a faint tint behind text in the label's shade.
// On the open workspace's row, whose background is already surface2, an uncolored chip uses surface1 so it still shows.
function LabelChip({ theme, label, onRaised = false }: { theme: Theme; label: CardModel["labels"][number]; onRaised?: boolean }) {
  const dark = isDarkSurface(theme.colors.surface0);
  const text = label.color ? identityText(label.color, dark) : theme.colors.foreground;
  return <View accessibilityLabel={`Label ${label.name}`} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    maxWidth: "100%", paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999,
    backgroundColor: label.color ? identityTint(label.color) : onRaised ? theme.colors.surface1 : theme.colors.surface2 }}>
    <Text numberOfLines={1} style={{ color: text, fontSize: font.xs }}>{label.name}</Text>
  </View>;
}

function IconButton({ theme, icon, label, onPress, children, danger = false }: {
  theme: Theme; icon?: string; label: string; onPress: () => void; children?: ReactNode; danger?: boolean;
}) {
  const { touch } = useCardHoverControls();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
    onHoverIn={() => touch(true)} onHoverOut={() => touch(false)}
    // As tall as the time it replaces, so showing the buttons never changes the row's height.
    style={(state) => ({ height: 20, minWidth: 20, paddingHorizontal: children ? 7 : 0, borderRadius: 6,
      alignItems: "center", justifyContent: "center",
      backgroundColor: danger ? theme.colors.statusDanger : isHovered(state) ? theme.colors.surface2 : "transparent",
      opacity: danger && isHovered(state) ? 0.85 : 1 })}>
    {icon ? <Icon name={icon} size={font.md} color={theme.colors.foregroundMuted} /> : children}
  </Pressable>;
}

export function WorkspaceCardView({ theme, model, fields, labelLimit, titleLines, active = false, projectIcon, onOpen, onOpenLink, actions, children,
  nodeRef, dropLine = null }: {
  theme: Theme; model: CardModel; fields: ReadonlySet<CardField>; labelLimit: LabelLimit; titleLines: TitleLines;
  active?: boolean; projectIcon?: ReactNode; onOpen?: () => void; onOpenLink?: (url: string) => void; actions?: CardActions; children?: ReactNode;
  // Drag and drop: the row's element for the sidebar to drag and drop on, and where a drop would land.
  nodeRef?: (node: unknown) => void; dropLine?: "before" | "after" | null;
}) {
  const has = (field: CardField) => fields.has(field);
  const { muted } = palette(theme);
  const pointer = useCardHover();
  // No details or hover buttons while something is being dragged.
  const dragging = useDragging() !== null;
  const hover = dragging ? { ...pointer, open: false, pointerInside: false } : pointer;
  // Archive and ⋯ replace the time while the pointer is on the row. Plugins cannot undo an archive, so archive asks to
  // be confirmed: Cancel and a red Archive button replace them for a few seconds, even if the pointer leaves the row.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => { if (!hover.pointerInside) setMenuOpen(false); }, [hover.pointerInside]);
  useEffect(() => {
    if (!confirmArchive) return;
    const timer = setTimeout(() => setConfirmArchive(false), ARCHIVE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmArchive]);
  const pressArchive = () => { if (confirmArchive) { setConfirmArchive(false); actions?.onArchive(); } else setConfirmArchive(true); };
  const showActions = Boolean(actions) && (hover.pointerInside || menuOpen || confirmArchive);

  // Every detail, one field per line, in the same pieces and colors as the row.
  const detailLines = () => {
    const extras = detailExtras(model, theme);
    const lines: (PanelLine & { pieces: Piece[] })[] = [];
    if (extras.status.text) lines.push({ pieces: [{ icon: extras.status.icon, spin: extras.status.spin, text: extras.status.text, color: extras.status.color }] });
    for (const item of fieldItems(model, theme, { fields: null, full: true, now: Date.now() })) {
      const link = item.link;
      lines.push({ pieces: item.pieces, onOpen: link && onOpenLink ? () => onOpenLink(link.url) : undefined,
        label: link ? `Open ${link.kind === "pr" ? "PR" : "issue"} ${link.repository}#${link.number}` : undefined });
    }
    if (extras.lastActivity) lines.push({ pieces: [extras.lastActivity] });
    return { lines, notes: extras.notes?.text ?? null };
  };
  // On desktop and web the details float beside the row, above the rest of the app, sized to fit everything.
  const rowRef = useRef<View | null>(null);
  const setRow = useCallback((node: View | null) => { rowRef.current = node; nodeRef?.(node); }, [nodeRef]);
  const floating = canFloat();
  useEffect(() => {
    if (!hover.open || !floating || !rowRef.current) return;
    let remove = () => {}, cancelled = false;
    const node = rowRef.current;
    node.measureInWindow((x, y, width, height) => {
      if (cancelled) return;
      const { lines, notes } = detailLines();
      remove = showFloatingPanel({ anchor: { x, y, width, height }, fontSource: node, title: model.title, lines, notes,
        labels: model.labels.map((label) => ({ name: label.name,
          color: label.color ? identityText(label.color, isDarkSurface(theme.colors.surface0)) : theme.colors.foreground,
          background: label.color ? identityTint(label.color) : theme.colors.surface2 })),
        colors: { background: theme.colors.surface1, border: theme.colors.border, foreground: theme.colors.foreground, muted },
        fontSize: { title: font.md, body: font.sm },
        // The pointer on the panel counts as on the row, so it stays open to read and click.
        onPointer: (inside) => { if (inside) hover.enter("panel"); else hover.leave(); } });
    });
    return () => { cancelled = true; remove(); };
  }, [hover.open, floating]);

  const items = fieldItems(model, theme, { fields, full: false, now: Date.now() });
  const labels = has("labels") ? limitLabels(model.labels, labelLimit) : { shown: [], hidden: 0 };
  const color = statusColor(theme, model.indicator);
  const badge = model.indicator !== "done";
  const running = model.indicator === "running";
  const leading = has("projectIcon") && projectIcon ? projectIcon
    : model.agent?.iconSvg ? <Icon icon={{ svg: model.agent.iconSvg }} size={16} color={muted} />
    // A running workspace's ring turns like a spinner, with a gap so the turning shows.
    : <Spin on={running}><View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: color,
      borderTopColor: running ? "transparent" : color }} /></Spin>;

  return <CardHoverProvider value={hover}><Pressable ref={setRow} testID="workspace-row" onPress={onOpen} accessible={false} focusable={false}
    // Resting anywhere on the row opens its details, like resting on one of its fields.
    onHoverIn={() => hover.enter("row")} onHoverOut={hover.leave}
    style={{ flexDirection: "row", alignItems: "flex-start", gap: 9, marginVertical: 1, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8,
      zIndex: hover.open || menuOpen ? 1000 : undefined,
      backgroundColor: active ? theme.colors.surface2 : hover.pointerInside ? theme.colors.surface1 : "transparent" }}>
    <Tip onPress={onOpen}>
      <View accessibilityLabel={model.indicatorLabel ?? undefined} style={{ width: 18, height: 20, alignItems: "center", justifyContent: "center" }}>
        {leading}
        {/* A running workspace's status dot pulses. */}
        {badge ? <View style={{ position: "absolute", right: -2, bottom: 0 }}><Pulse on={running}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color,
            borderWidth: 1.5, borderColor: active ? theme.colors.surface2 : theme.colors.surface0 }} />
        </Pulse></View> : null}
      </View>
    </Tip>
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      {/* Details open downward on phones, so each line is layered above the lines below it. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 20, zIndex: 6 }}>
        <Tip layer={5} grow onPress={onOpen} accessibilityRole="button" accessibilityState={{ selected: active }}
          accessibilityLabel={`Open ${model.title}${model.indicatorLabel ? `, ${model.indicatorLabel}` : ""}`}>
          <Text numberOfLines={titleLines === "all" ? undefined : Number(titleLines)}
            style={{ color: theme.colors.foreground, fontSize: font.md, lineHeight: 20, fontWeight: active ? "600" : "400" }}>{model.title}</Text>
        </Tip>
        {has("lastActivity") && model.lastActivity ? <Tip onPress={onOpen}>
          <Text accessibilityLabel={`Last activity ${model.lastActivity}`} style={{ color: muted, fontSize: metaFont }}>{model.lastActivity}</Text>
        </Tip> : null}
        {/* The buttons float over the end of the title line instead of taking space in it, so showing them never
            narrows the title (which could wrap it onto another line) or changes the row's height. */}
        {/* Above the title, which spans the line, so presses reach the buttons. */}
        {showActions ? <View style={{ position: "absolute", right: 0, top: 0, height: 20, flexDirection: "row", alignItems: "center", gap: 4,
          paddingLeft: 6, zIndex: 10, backgroundColor: active ? theme.colors.surface2 : theme.colors.surface1 }}>
          {confirmArchive ? <>
            <IconButton theme={theme} label="Cancel archive" onPress={() => setConfirmArchive(false)}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.xs, fontWeight: "500" }}>Cancel</Text>
            </IconButton>
            <IconButton theme={theme} label="Confirm archive" danger onPress={pressArchive}>
              <Text style={{ color: "#FFFFFF", fontSize: font.xs, fontWeight: "600" }}>Archive</Text>
            </IconButton>
          </> : <>
            <IconButton theme={theme} icon="Archive" label="Archive workspace" onPress={pressArchive} />
            <IconButton theme={theme} icon="EllipsisVertical" label="Workspace actions" onPress={() => setMenuOpen((value) => !value)} />
          </>}
        </View> : null}
      </View>
      {/* Each field carries its "·" in a left gutter. The line is shifted left by one gutter and clipped, so the "·"
          before the first field of every wrapped line falls outside it and only separators between fields show. */}
      {items.length ? <View style={{ overflow: "hidden", zIndex: 4 }}><View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center",
        rowGap: 2, marginLeft: -separatorGutter }}>
        {items.map((item) => <View key={item.key} style={{ flexDirection: "row", alignItems: "center", flexShrink: 1, minWidth: 0, maxWidth: "100%",
          paddingLeft: separatorGutter }}>
          <Text accessibilityElementsHidden importantForAccessibility="no" style={{ position: "absolute", left: 0, width: separatorGutter,
            textAlign: "center", color: muted, fontSize: metaFont }}>·</Text>
          {item.link ? <Tip accessibilityRole="link" accessibilityLabel={`Open ${item.link.kind === "pr" ? "PR" : "issue"} ${item.link.repository}#${item.link.number}`}
            onPress={onOpenLink ? () => onOpenLink(item.link!.url) : undefined}>{(hovered) => <FieldView item={item} underline={hovered} />}</Tip>
            : <Tip onPress={onOpen}><FieldView item={item} /></Tip>}
        </View>)}
      </View></View> : null}
      {labels.shown.length ? <View accessibilityLabel="Labels" style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, paddingTop: 1, zIndex: 3 }}>
        {labels.shown.map((label) => <Tip key={label.name} onPress={onOpen}><LabelChip theme={theme} label={label} onRaised={active} /></Tip>)}
        {labels.hidden ? <Tip onPress={onOpen}>
          <View accessibilityLabel={`${labels.hidden} more labels`} style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: theme.colors.surface2 }}>
            <Text style={{ color: muted, fontSize: font.xs }}>+{labels.hidden}</Text>
          </View>
        </Tip> : null}
      </View> : null}
      {has("notes") && model.notes ? <Tip layer={2} onPress={onOpen}>
        <Text numberOfLines={3} style={{ color: muted, fontSize: metaFont, lineHeight: 18 }}>{model.notes}</Text>
      </Tip> : null}
      {children}
    </View>
    {/* The menu and its items count as the row for hover, so moving onto them keeps the menu open. */}
    {actions && menuOpen ? <Pressable accessibilityRole="menu" accessibilityLabel="Workspace actions menu"
      onHoverIn={() => hover.touch(true)} onHoverOut={() => hover.touch(false)}
      style={{ position: "absolute", top: 30, right: 6,
      zIndex: 30, minWidth: 170, padding: 4, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1,
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8, cursor: "auto" } as object}>
      {[actions.onEdit ? ["Edit details", actions.onEdit] as const : null,
        actions.onRename ? ["Rename…", actions.onRename] as const : null,
        actions.onCopyPath ? ["Copy path", actions.onCopyPath] as const : null,
        actions.onCopyBranch ? ["Copy branch name", actions.onCopyBranch] as const : null,
        actions.onTogglePin ? [actions.pinned ? "Unpin" : "Pin to top", actions.onTogglePin] as const : null,
        ["Archive…", () => setConfirmArchive(true)] as const].filter((item) => item !== null).map(([label, run]) =>
        <Pressable key={label} accessibilityRole="menuitem" accessibilityLabel={label} onPress={() => { setMenuOpen(false); run(); }}
          onHoverIn={() => hover.touch(true)} onHoverOut={() => hover.touch(false)}
          style={(state) => ({ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: isHovered(state) ? theme.colors.surface2 : "transparent" })}>
          <Text style={{ color: label === "Archive…" ? theme.colors.statusDanger : theme.colors.foreground, fontSize: font.sm }}>{label}</Text>
        </Pressable>)}
    </Pressable> : null}
    {hover.open && !floating ? (() => {
      // Phones have no hover or room beside the row, so a long press shows the details below the row instead.
      const { lines, notes } = detailLines();
      return <View accessibilityRole="text" accessibilityLabel="Workspace details" pointerEvents="none"
        style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 100, gap: 5,
          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: font.md, fontWeight: "600" }}>{model.title}</Text>
        {lines.map(({ pieces }, index) => <FieldView key={index} item={{ key: String(index), label: "", pieces }} wrap />)}
        {model.labels.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {model.labels.map((label) => <LabelChip key={label.name} theme={theme} label={label} />)}
        </View> : null}
        {notes ? <Text style={{ color: muted, fontSize: metaFont }}>{notes}</Text> : null}
      </View>;
    })() : null}
    {/* The open workspace: an accent bar along its left edge, with a bold title and a raised background. */}
    {/* Over the content rather than under it, so the hover buttons' solid backdrop takes the tint too; below the menu. */}
    {running ? <Glow color={color} radius={8} dark={isDarkSurface(theme.colors.surface0)} /> : null}
    {active ? <View testID="active-marker" pointerEvents="none" style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: 2,
      backgroundColor: theme.colors.accent }} /> : null}
    {/* Where a dragged workspace would land: a line above or below this row. */}
    {dropLine ? <View testID="drop-line" pointerEvents="none" style={{ position: "absolute", left: 6, right: 6, height: 2, borderRadius: 1,
      backgroundColor: theme.colors.accent, ...(dropLine === "before" ? { top: -2 } : { bottom: -2 }) }} /> : null}
  </Pressable></CardHoverProvider>;
}
