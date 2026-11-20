# Workspace organizer: agent guide

A Paseo plugin that replaces the workspace sidebar and celebrates merged PRs. The client UI is React Native rendered by React Native Web on desktop and web, and natively on phones. A daemon-side server entry indexes workspaces, looks up PRs and serves icons and colors.

## Layout

- `index.client.tsx` and `index.server.ts` are the plugin entries.
- `client/` holds the UI.
- `server/` runs on the daemon.
- `shared/` is pure logic used by both, and is where unit-testable rules live.
- `preview/` is a stand-in Paseo host (`host.tsx`) and UI kit (`ui.tsx`) for tests and `npm run preview`. It is not shipped.
- `client/celebration/`, `server/celebration/` and `shared/celebration/` are the merge celebration, started from both entries. Its overlay mounts its own React Native Web root on `document`, so it runs only on desktop and web.
- `tests/` holds the vitest suites (jsdom). Celebration server tests under `tests/celebration/` run in node (`// @vitest-environment node`).

## Verify every change

1. `npm run typecheck` and `npm test`.
2. `paseo plugin reload paseo-workspace-organizer`, then `paseo plugin logs paseo-workspace-organizer` should end with `Plugin ready`. A `codesign_util` stderr line is harmless.
3. For anything visual or interactive, run `npm run preview` (http://127.0.0.1:5173) and check it with the Paseo browser tools: screenshot it, and measure positions and styles with `browser_evaluate`. `browser_drag` starts a native drag but can't finish one, so test drag and drop by dispatching real `DragEvent`s from `browser_evaluate`.

Done means all three pass, and you have observed the behaviour in the preview, not just in tests.

## Paseo plugin constraints

- **Module folders:** Paseo only builds plugin code under `client/`, `server/` and `shared/`. Anything else fails to load with "Plugin modules belong in client/, server/, or shared/".
- **Host modules:** only `react`, `react-native`, `zod`, `@tanstack/react-query` and the `@getpaseo/plugin` entries exist at runtime, and an installed plugin has no `node_modules`, so this holds for type-only imports too (derive types from the plugin API instead). A test enforces it. There is no `react-dom`, so direct DOM work lives in `client/web.ts`, gated on `canFloat()` (web with a `document`).
- **Host-scoped settings:** every host-scoped `defineSettings` document must be registered with `server.registerSettings` in `index.server.ts`, or the client gets "does not contribute RPC settings.*.read". A test enforces this.
- **Settings versions:** 0.1.0 was published with every settings document at version 1, so saved settings must keep working from here on. A schema change bumps the document's `version` and adds a `migrate` that parses every older version; a new field also gets `.catch().default()` so a missing or bad value falls back. Adding a choice to an enum needs no bump: saved documents stay valid, and an older version's `.catch()` falls back instead of refusing the whole document as a bump would. Paseo refuses settings saved under a newer version than the plugin's. `preferences` is per device; `organization`, `cards` and `celebration` are per host.
- **RPC limits:** RPC names match `/^[a-z][a-z0-9._-]*$/`, and paged queries take `limit` ≤ 200.
- **Data Paseo doesn't expose to plugins** is read from its private storage. These interfaces are unpublished, so keep the readers small and failure-tolerant:
  - project icons: `~/.paseo/projects/icons/<sha256(projectId)>.bin`, plus discovery in the project folder
  - label colors: `~/.paseo/projects/workspace-labels.json`
  - host colors and badges, and which hosts are this computer's (a `direct` connection to a loopback address): localStorage `@paseo:daemon-registry`
  - the device's Groups from pick, read before any sidebar draws: localStorage `@paseo:plugin-device-settings:<plugin id>/preferences`
  - keyboard shortcut changes: localStorage `@paseo:keyboard-shortcut-overrides`, loaded into the react-query key `["keyboard-shortcut-overrides"]`. The plugin writes both, only when the user flips the ⌘[ / ⌘] setting (`client/paseo-shortcuts.ts`).
- **One copy per host:** Paseo loads the plugin once per host that has it, in the same window, and shows the first copy's sidebar view whatever its host. `client/sidebar-placement.ts` has the copies agree through `globalThis` on one host (see `sidebarHostFor`), so only that copy adds the view.
- **Stand-in host:** when code uses a new host API, add it to `preview/host.tsx` so the tests and the preview exercise it.

## React Native Web gotchas

- **Stacking:** every `View` gets `z-index: 0`, so every `View` starts a stacking context. Layer overlapping parts explicitly. In a row, the title line sits above the lines below, and hover buttons sit above the title. Give a wrapper that must not trap its children's layers `zIndex: "auto"`, as `Leaving` in `client/motion.tsx` does.
- **Hover:** a child taking hover ends its parent's hover. Rows track pointer presence through `useCardHoverControls().touch()` from every child that can take hover, including buttons and menu items. Disabled `Pressable`s get no hover events.
- **Layout:** `measureInWindow` reports asynchronously, and jsdom never lays out. So keep layout decisions as pure functions in `shared/` (like `firstLineCount`) and test them there.
- **Animations:** React Native Web's `Animated` calls Metro's `global` when an animation stops; `client/motion.tsx` defines it. Every animation goes through `useReduceMotion`. In jsdom that reports reduced motion, so animations finish instantly in tests. Verify motion in the preview.
- **Web-only styles:** `position: "sticky"`, `width: "max-content"` and `outline*` pass through to CSS; cast the style object.

## Screenshots

The README's screenshots come from the preview with `?showcase` (add `&celebrate` for the merge celebration), which loads a fictional team's workspaces (`preview/showcase.ts`) and draws Paseo's real Lucide icons (`preview/lucide-icons.ts`, extracted from the installed Paseo app). Capture them there, never from a real Paseo window, so no one's workspaces, hosts or repositories appear. Crop the 2× capture with `sips -c <height> <width> --cropOffset <y> <x>`; offsets of 0 are ignored, so use 1.

## Tests

- **Pure rules** go in `shared/` with a focused test.
- **UI behaviour:** render `OrganizerSidebar` or `WorkspaceCardView` against `preview/host.tsx`.
- **Hover:** fire `pointerEnter`/`pointerLeave` with `{ pointerType: "mouse" }`.
- **Delays:** use fake timers (`HOVER_DELAY_MS`, `HINT_DELAY_MS`).
- **Bug fixes:** write the test first and watch it fail.

## Repo rules

- **Version:** the package is at **0.1.1**; change it only when the owner asks for a release. Settings schema versions are separate (see Settings versions).
- **User docs:** when a feature changes, update its row in the README's "What's built in" table, the behaviour in `docs/guide.md`, and `OVERVIEW.md`, the summary shipped with the package.
- **Commits:** each commit is one coherent change that typechecks and passes its tests on its own.
- **Comments:** say why in plain language, one or two lines, next to the code they explain.
