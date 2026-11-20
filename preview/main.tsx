// React Native Web's animations call Metro's `global` when they stop; Paseo's app defines it, this preview must too.
Reflect.set(globalThis, "global", globalThis);
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { OrganizerSidebar } from "../client/sidebar";
import { CardSettingsScreen } from "../client/card-settings";
import { agent, makeIndex, setAgents, setWorkspaces, theme, workspace } from "./host";
import { loadShowcase, showcaseCelebration } from "./showcase";
import { parseGithubLink } from "../shared/organization";
import { createCelebrationStore } from "../client/celebration/store";
import { createPresentationStore } from "../client/celebration/presentation";
import { mountBrowserOverlay } from "../client/celebration/web";
import { SettingsScreen as CelebrationSettingsScreen } from "../client/celebration/settings";
import { previewCelebration } from "../shared/celebration/celebration";
import { defaultSettings as celebrationDefaults } from "../shared/celebration/settings";

Reflect.set(globalThis, "__ORGANIZER_PREVIEW_ICONS__", true);
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
// ?showcase loads a fictional team's workspaces for screenshots; otherwise a small sample to work against.
const showcase = new URLSearchParams(location.search).has("showcase") ? loadShowcase() : null;
// Paseo's desktop app on macOS hides scrollbars until you scroll; screenshots match it.
if (showcase) {
  const style = document.createElement("style");
  style.textContent = "*::-webkit-scrollbar { display: none; } * { scrollbar-width: none; }";
  document.head.appendChild(style);
}
if (!showcase) {
  setWorkspaces([
    workspace("sidebar", "Restructure workspace navigation", { name: "sidebar-organizer", labels: ["plugin", "📲 S25", "review:ui"], branch: "feature/sidebar-organizer",
      lastPromptAt: minutesAgo(12), statusEnteredAt: minutesAgo(12), createdAt: minutesAgo(600), directory: "/Users/me/work/paseo/.worktrees/sidebar" }),
    workspace("search", "Search by GitHub references", { indicator: "needs_input", indicatorLabel: "Needs input", status: "needs_input",
      labels: ["search", "📲 P10", "review:api"], lastPromptAt: minutesAgo(95), statusEnteredAt: minutesAgo(80), createdAt: minutesAgo(2000) }),
    workspace("mobile", "Polish compact sidebar layout", { indicator: "done", indicatorLabel: "Done", status: "done",
      lastPromptAt: minutesAgo(300), statusEnteredAt: minutesAgo(281), createdAt: minutesAgo(5000) }),
    workspace("notes", "Explore next ideas", { projectId: "notes", projectDisplayName: "notes", branch: null, indicator: "done", indicatorLabel: "Done", status: "done" }),
  ]);
  setAgents([agent("main", "sidebar", { status: "running", lastActivityAt: minutesAgo(1) }),
    agent("sub-1", "sidebar", { parentAgentId: "main", status: "running" }), agent("sub-2", "sidebar", { parentAgentId: "main", status: "running" }),
    agent("sub-3", "sidebar", { parentAgentId: "main", status: "idle" }), agent("search-agent", "search", { provider: "claude", model: "opus", thinkingOptionId: "high" })]);
}

const index = makeIndex(showcase?.index);
// The merge celebration overlay, as the plugin mounts it in Paseo; its settings screen feeds it settings.
const celebrations = createCelebrationStore();
const presentation = createPresentationStore();
presentation.update(theme);
mountBrowserOverlay({ store: celebrations, presentation, onOpenWorkspace() {}, async onArchive() {}, onPresented() {} });
const celebrate = () => celebrations.show({ ...previewCelebration, id: `preview-${Date.now()}` });
if (showcase && new URLSearchParams(location.search).has("celebrate")) {
  presentation.updateSettings(celebrationDefaults);
  setTimeout(() => celebrations.show(showcaseCelebration), 300);
}
function Preview() {
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState<any>(showcase?.active ?? null);
  const { width } = useWindowDimensions();
  return <View style={{ height: "100%", flexDirection: "row", backgroundColor: theme.colors.surface0 }}>
    <View style={{ width: width < 600 ? width : compact ? 280 : 360, maxWidth: "100%", height: "100%", borderRightWidth: 1, borderRightColor: theme.colors.border }}>
      <OrganizerSidebar theme={theme} layout={{ compact, platform: "web" }} active={{ workspace: active, agent: null }}
        navigation={{ openWorkspace: setActive, openAgent() {}, openTerminal() {}, openProject() {} }} dismiss={() => {}} index={index}
        // Paseo opens the plugin's settings screen; the preview scrolls to its copy beside the sidebar.
        openCardSettings={() => document.querySelector('[aria-label="View"]')?.scrollIntoView({ behavior: "smooth" })}
        // The daemon looks bare numbers up with the GitHub CLI; here, odd numbers are PRs and even ones issues.
        resolveLinks={async ({ numbers }) => ({ errors: [], links: numbers.map((number) =>
          parseGithubLink(`https://github.com/getpaseo/paseo/${number % 2 ? "pull" : "issues"}/${number}`)) })} />
    </View>
    {/* Screenshots show an empty workspace beside the sidebar rather than these notes and settings. */}
    {showcase ? null : width >= 600 ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 30, gap: 20, maxWidth: 760 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 22 }}>Workspace organizer</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>Interactive preview with sample workspaces. Drag workspaces and groups to organize them, try Group by, and search #385.</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>Selected workspace: {active?.id ?? "none"}</Text>
      <Pressable accessibilityRole="button" onPress={() => setCompact(!compact)}><Text style={{ color: theme.colors.accent }}>{compact ? "Use desktop width" : "Use compact width"}</Text></Pressable>
      <CardSettingsScreen theme={theme} layout={{ compact: false, platform: "web" }} />
      <Text style={{ color: theme.colors.foreground, fontSize: 18, marginTop: 10 }}>Merge celebration</Text>
      <CelebrationSettingsScreen theme={theme} layout={{ compact: false, platform: "web" }} presentation={presentation} onPreview={celebrate} />
    </ScrollView> : null}
  </View>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
