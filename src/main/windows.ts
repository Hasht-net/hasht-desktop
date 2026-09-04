import { BrowserWindow, session, shell } from "electron";
import path from "node:path";
import type { ServerEntry } from "./serverStore";
import { clearUnread } from "./tray";
import { enableScreenShare } from "./screenShare";

// Height of the draggable strip the page reserves at the top of the window.
// macOS traffic lights are small and inset (28px fits); Windows caption
// buttons need the system's own 32px title bar height or Electron's overlay
// controls won't fit.
export const TITLEBAR_HEIGHT = process.platform === "darwin" ? 28 : 32;

const serverWindows = new Map<string, BrowserWindow>();
const serverIdByWebContentsId = new Map<number, string>();
let pickerWindow: BrowserWindow | null = null;
let isQuitting = false;

export function setQuitting(value: boolean): void {
  isQuitting = value;
}

export function serverIdForWebContents(webContentsId: number): string | undefined {
  return serverIdByWebContentsId.get(webContentsId);
}

// One BrowserWindow + one isolated session partition per server (matches
// Mattermost/Rocket.Chat Desktop): a malicious self-hosted server gets its
// own cookie jar/localStorage, never direct Node/Electron access.
export function openServerWindow(entry: ServerEntry): BrowserWindow {
  const existing = serverWindows.get(entry.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const partition = `persist:server-${entry.id}`;
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: entry.name,
    // No native title bar: the page paints the whole window and reserves a
    // drag strip at the top (see TITLEBAR_HEIGHT in the preload), so the app's
    // own background runs edge to edge instead of sitting under grey chrome.
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 13, y: 8 } : undefined,
    // Windows/Linux have no traffic lights to inherit, so Electron draws the
    // controls over our strip instead. Dark to match the app's default theme.
    titleBarOverlay: isMac
      ? undefined
      : { color: "#131417", symbolColor: "#dbdee1", height: TITLEBAR_HEIGHT },
    // Painted before the page loads, so a cold start doesn't flash white.
    backgroundColor: "#131417",
    webPreferences: {
      session: session.fromPartition(partition),
      preload: path.join(__dirname, "../preload/serverPreload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // A sandboxed preload can't import from main, so TITLEBAR_HEIGHT is
      // passed as an argv flag instead of being duplicated there.
      additionalArguments: [`--titlebar-height=${TITLEBAR_HEIGHT}`],
      // A hidden window is still the live connection to the server; letting
      // Chromium throttle its timers delays notifications and reconnects.
      backgroundThrottling: false,
    },
  });

  // Electron grants every permission request when no handler is installed, so
  // an untrusted server would get mic/cam/geolocation for free. Voice needs
  // media and the app needs notifications; nothing else, and only from the
  // server's own origin.
  const serverSession = session.fromPartition(partition);
  serverSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(isPermitted(permission, details.requestingUrl, entry.url));
  });

  // The request handler only covers prompts; navigator.permissions.query and
  // some getUserMedia/device-enumeration paths go through this synchronous
  // check instead, which also defaults to allow.
  serverSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    isPermitted(permission, requestingOrigin, entry.url),
  );

  // Without this `getDisplayMedia()` is refused before any picker appears.
  enableScreenShare(serverSession);

  win.loadURL(entry.url);

  // Everything on the server's own origin stays in-window; anything else
  // (e.g. a link-preview target, an external link in a message) opens in
  // the OS default browser instead of becoming a second app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSameOrigin(url, entry.url)) {
      return { action: "allow" };
    }
    openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isSameOrigin(url, entry.url)) return;
    event.preventDefault();
    openExternal(url);
  });

  // Electron has no Push API, so the renderer is the only live connection —
  // closing it would kill unread counts and notifications. Hide instead.
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  // Captured up front: `closed` fires after the native object is gone, so
  // reaching for win.webContents there throws "Object has been destroyed".
  const webContentsId = win.webContents.id;

  win.on("closed", () => {
    clearUnread(entry.id);
    serverWindows.delete(entry.id);
    serverIdByWebContentsId.delete(webContentsId);
  });
  serverWindows.set(entry.id, win);
  serverIdByWebContentsId.set(webContentsId, entry.id);
  return win;
}

export function closeServerWindow(id: string): void {
  // close() only hides now, so callers that really mean "this server is gone"
  // need destroy().
  const win = serverWindows.get(id);
  if (win && !win.isDestroyed()) win.destroy();
}

export function getServerWindow(id: string): BrowserWindow | undefined {
  return serverWindows.get(id);
}

export function openPickerWindow(): BrowserWindow {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.show();
    pickerWindow.focus();
    return pickerWindow;
  }

  pickerWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    title: "Manage backends",
    webPreferences: {
      preload: path.join(__dirname, "../preload/pickerPreload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  pickerWindow.setMenuBarVisibility(false);
  // __dirname-relative, not app.getAppPath(): the latter is the repo root under
  // `electron .` but dist/main under `electron dist/main/main.js` (what the dev
  // script runs), which broke the picker outright.
  pickerWindow.loadFile(
    path.join(__dirname, "../../src/renderer-picker/picker.html"),
  );
  pickerWindow.on("closed", () => (pickerWindow = null));
  return pickerWindow;
}

export function closePickerWindow(): void {
  pickerWindow?.close();
}

function isPermitted(
  permission: string,
  requestingUrl: string | undefined,
  serverUrl: string,
): boolean {
  // "display-capture" is screen sharing. The handler installed by
  // enableScreenShare is what actually picks the surface — this only decides
  // whether the origin may ask at all, same as it does for mic and camera.
  if (
    permission !== "media" &&
    permission !== "notifications" &&
    permission !== "display-capture"
  )
    return false;
  return isSameOrigin(requestingUrl ?? "", serverUrl);
}

// Hand the OS only schemes a browser/mail client should handle; a server-
// supplied file:// or custom-scheme URL would otherwise be a launcher.
function openExternal(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return;
  }
  if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") {
    shell.openExternal(url);
  }
}

function isSameOrigin(url: string, serverUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(serverUrl).origin;
  } catch {
    return false;
  }
}
