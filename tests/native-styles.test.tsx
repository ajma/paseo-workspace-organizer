import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Platform } from "react-native";
import { OrganizerSidebar } from "../client/sidebar";
import { WorkspaceCardView } from "../client/card";
import { sampleCard } from "../client/card-sample";
import { cardFields } from "../shared/cards";
import { makeIndex, resetHost, theme } from "../preview/host";

// iOS and Android crash on CSS-only style values such as zIndex "auto", which the web accepts. With Platform.OS set to
// a phone, nothing rendered may carry one.
const original = Platform.OS;
beforeEach(resetHost);
afterEach(() => { Object.defineProperty(Platform, "OS", { value: original, configurable: true }); });

function webOnlyStyles(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("*")].flatMap((element) => {
    const style = element.style;
    return [style.zIndex === "auto" && "zIndex: auto", style.width === "max-content" && "width: max-content",
      style.position === "sticky" && "position: sticky", style.position === "fixed" && "position: fixed"].filter(Boolean);
  });
}

it.each(["ios", "android"] as const)("renders no web-only style values on %s", (os) => {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  const sidebar = render(<OrganizerSidebar theme={theme} layout={{ compact: true, platform: os }} index={makeIndex()}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  expect(webOnlyStyles(sidebar.container)).toEqual([]);
  sidebar.unmount();
  const card = render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all" titleLines="2" />);
  expect(webOnlyStyles(card.container)).toEqual([]);
});

it("pins group headers on phones through the scroll list's sticky headers", async () => {
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const sidebar = render(<OrganizerSidebar theme={theme} layout={{ compact: true, platform: "ios" }} index={makeIndex()}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  // Each header, nested ones included, is one of the list's own items and is pinned.
  const sticky = [...sidebar.container.querySelectorAll<HTMLElement>("*")].filter((element) => getComputedStyle(element).position === "sticky");
  const titles = sticky.map((element) => element.querySelector('[role="button"][aria-label^="Collapse"]')?.getAttribute("aria-label"));
  expect(titles).toEqual(["Collapse In progress", "Collapse Interface", "Collapse Later", "Collapse Ungrouped"]);
  // Collapsing a group hides its subgroups' headers too.
  fireEvent.click(screen.getByRole("button", { name: "Collapse In progress" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Collapse Interface" })).toBeNull());
  sidebar.unmount();
});

it("draws pinned group headers with square corners so rows never show through", () => {
  const sidebar = render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} index={makeIndex()}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  const header = screen.getByRole("button", { name: "Collapse In progress" }).parentElement!.parentElement as HTMLElement;
  expect(header.style.position).toBe("sticky");
  expect(header.style.borderTopLeftRadius || header.style.borderRadius || "0px").toBe("0px");
  sidebar.unmount();
});
