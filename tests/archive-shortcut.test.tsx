import { afterEach, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { ARCHIVE_CONFIRM_MS, useArchiveShortcut } from "../client/archive-shortcut";
import { shownToasts } from "../preview/ui";

const ref = { kind: "workspace" as const, hostId: "mini", id: "w1", key: '["mini","w1"]' };
function Harness({ active, connect }: { active: typeof ref | null; connect: any }) { useArchiveShortcut(active, connect); return null; }
// jsdom is not a Mac, so the shortcut is Ctrl+Shift+Backspace here.
const press = (extra: Partial<KeyboardEventInit> = {}) => act(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", ctrlKey: true, shiftKey: true, ...extra }));
});
afterEach(() => { shownToasts.length = 0; vi.useRealTimers(); });

it("archives the open workspace on a second press, after a warning on the first", async () => {
  const archive = vi.fn(async () => ({}));
  const connect = vi.fn(() => ({ workspaces: { archive } }));
  render(<Harness active={ref} connect={connect} />);
  press();
  expect(archive).not.toHaveBeenCalled();
  expect(shownToasts.at(-1)?.message).toBe("Press Ctrl+Shift+Backspace again to archive this workspace.");
  press();
  expect(connect).toHaveBeenCalledWith("mini");
  expect(archive).toHaveBeenCalledWith("w1");
  await vi.waitFor(() => expect(shownToasts.at(-1)?.message).toBe("Workspace archived"));
});

it("needs the second press within the time limit, ignores other keys, and needs an open workspace", () => {
  vi.useFakeTimers();
  const archive = vi.fn(async () => ({}));
  const view = render(<Harness active={ref} connect={() => ({ workspaces: { archive } })} />);
  press();
  act(() => { vi.advanceTimersByTime(ARCHIVE_CONFIRM_MS + 1); });
  press();
  expect(archive).not.toHaveBeenCalled();
  press({ shiftKey: false });
  press({ key: "Delete" });
  expect(archive).not.toHaveBeenCalled();
  view.rerender(<Harness active={null} connect={() => ({ workspaces: { archive } })} />);
  press(); press();
  expect(archive).not.toHaveBeenCalled();
  expect(shownToasts.at(-1)?.message).toBe("Open a workspace to archive it.");
});

it("reports a failed archive", async () => {
  render(<Harness active={ref} connect={() => ({ workspaces: { archive: async () => { throw new Error("worktree busy"); } } })} />);
  press(); press();
  await vi.waitFor(() => expect(shownToasts.at(-1)).toEqual({ message: "Failed to archive workspace: worktree busy", kind: "error" }));
});
