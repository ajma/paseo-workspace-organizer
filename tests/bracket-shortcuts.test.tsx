import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardSettingsScreen } from "../client/card-settings";
import { OrganizerSidebar } from "../client/sidebar";
import { HINT_DELAY_MS } from "../client/hint";
import { makeIndex, resetHost, theme } from "../preview/host";
import { workspaceKey } from "../shared/organization";

// Where Paseo keeps its shortcut changes: app storage, loaded into a react-query cache.
const STORAGE_KEY = "@paseo:keyboard-shortcut-overrides";
const QUERY_KEY = ["keyboard-shortcut-overrides"];
const PREVIOUS = "workspace-navigate-relative-cmd-left-mac", NEXT = "workspace-navigate-relative-cmd-right-mac";
let platform: { mockRestore(): void };
beforeEach(() => { resetHost(); platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel"); });
afterEach(() => { platform.mockRestore(); localStorage.clear(); vi.useRealTimers(); });

it("hands ⌘[ / ⌘] from Paseo's Previous and Next workspace to back and forward, and gives them back", () => {
  const client = new QueryClient();
  // Another shortcut the user changed stays as it is.
  const other = { "workspace-tab-navigate-relative-cmd-shift-left-mac": "Cmd+Alt+[" };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(other));
  client.setQueryData(QUERY_KEY, other);
  render(<QueryClientProvider client={client}><CardSettingsScreen theme={theme} layout={{ compact: false, platform: "web" }} /></QueryClientProvider>);
  const toggle = () => screen.getByRole("switch", { name: "Back and forward with ⌘[ and ⌘]" }) as HTMLInputElement;
  expect(toggle().checked).toBe(false);
  fireEvent.click(toggle());
  const freed = { ...other, [PREVIOUS]: null, [NEXT]: null };
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(freed);
  // Paseo's live shortcuts change at once, without a restart.
  expect(client.getQueryData(QUERY_KEY)).toEqual(freed);
  expect(toggle().checked).toBe(true);
  fireEvent.click(toggle());
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(other);
  expect(client.getQueryData(QUERY_KEY)).toEqual(other);
  expect(toggle().checked).toBe(false);
});

it("names ⌘[ in the Back button's hint once Paseo no longer uses it, and ⌘← before", () => {
  const ref = (id: string) => ({ kind: "workspace" as const, hostId: "local", id, key: workspaceKey("local", id) });
  const sidebar = (id: string) => <OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} active={{ workspace: ref(id), agent: null } as any}
    navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />;
  const hint = () => {
    vi.useFakeTimers();
    const back = screen.getByRole("button", { name: /^Back to/ });
    fireEvent.pointerEnter(back, { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(HINT_DELAY_MS); });
    const text = screen.getByRole("tooltip").textContent;
    fireEvent.pointerLeave(back, { pointerType: "mouse" });
    vi.useRealTimers();
    return text;
  };
  let view = render(sidebar("search"));
  view.rerender(sidebar("mobile"));
  expect(hint()).toBe("Back to Search by GitHub references (⌘←)");
  view.unmount();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ [PREVIOUS]: null, [NEXT]: null }));
  view = render(sidebar("mobile"));
  expect(hint()).toBe("Back to Search by GitHub references (⌘[)");
});
