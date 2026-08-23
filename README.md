# hasht-desktop

Electron shell for the self-hosted chat app. Thin client: it loads whatever
frontend the configured server is already serving (no bundled copy of the
web app), the same architecture as Mattermost Desktop / Rocket.Chat Desktop.

## Why this exists instead of just using the installed PWA

The web app is already an installable PWA (manifest + service worker). This
shell adds what a PWA can't reliably give you across Windows/Mac/Linux:
a persistent tray icon with unread badges, background operation after the
window is closed, a multi-server switcher, and a real code-signed
auto-updating installer. It intentionally does **not** duplicate the
frontend — updating the server updates every desktop client instantly, with
no separate frontend release train to keep in sync.

## Architecture

- `src/main/` — Electron main process (Node). `main.ts` is the entrypoint;
  `windows.ts` opens one `BrowserWindow` per configured server, each on its
  own session partition (isolated storage — auth is a bearer token in that
  partition's localStorage, not a cookie — mirrors Mattermost's per-server
  renderer); `tray.ts` owns the tray icon/menu/badge; `serverStore.ts`
  persists the server list via `electron-store`; `desktopAuth.ts` handles the
  `hasht://` deep-link browser sign-in handoff; `updater.ts` wires up
  `electron-updater` against the GitHub releases feed.
- `src/preload/` — sandboxed preload scripts, the only bridge between a
  server's page and the main process. `serverPreload.ts` just watches
  `document.title` for the app's existing `(N) ...` unread-*channel*-count
  format and forwards it to main — no changes needed in the web app itself.
  `pickerPreload.ts` backs the "add a server" window.
- `src/renderer-picker/` — plain HTML/JS "add a server" screen, shown on
  first run and from the tray's "Add a server…" item.

## Not yet built (left for follow-up work)

- Code signing / notarization secrets in CI (macOS builds are ad-hoc signed
  only, Windows builds are unsigned — see the comments in
  `electron-builder.yml`).
- App icons — `build/tray-icon.png` and the electron-builder `icon` fields
  are unset; drop real assets in `build/` before shipping.

Deep link handling (`hasht://` protocol) and `electron-updater` wiring are
already built — see `src/main/desktopAuth.ts` and `src/main/updater.ts`.

## Develop

```
npm install
npm run dev
```

## Build installers

Requires running on (or cross-compiling from) each target OS — mac builds
need to run on macOS for signing/notarization; Windows/Linux can cross-build
from macOS or Linux CI runners.

```
npm run dist:mac    # dmg + zip, x64 + arm64 (universal)
npm run dist:win    # nsis installer, x64 + arm64
npm run dist:linux  # AppImage + deb + rpm, x64 + arm64
```
