import { Tray, Menu, nativeImage, app, NativeImage } from "electron";
import path from "node:path";
import { getActiveServer, listServers, ServerEntry } from "./serverStore";
import { getAllServerWindows, getServerWindow } from "./windows";

let tray: Tray | null = null;
let unreadTotal = 0;
const unreadByServer = new Map<string, number>();

// Windows-only taskbar button badge (macOS/Linux use app.setBadgeCount's dock
// badge instead). Loaded once and reused rather than re-decoded per update.
let overlayBadge: NativeImage | null = null;
function getOverlayBadge(): NativeImage | null {
  if (overlayBadge) return overlayBadge;
  const img = nativeImage.createFromPath(
    path.join(__dirname, "../../build/overlay-badge.png"),
  );
  overlayBadge = img.isEmpty() ? null : img;
  return overlayBadge;
}

export function initTray(opts: {
  onSwitchServer: (id: string) => void;
  onAddServer: () => void;
  onQuit: () => void;
}): void {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "../../build/tray-icon.png"),
  );
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Hasht");
  rebuildMenu(opts);

  tray.on("click", () => {
    // The active server's window, not getAllWindows()[0] — that is often the
    // picker, which isn't what a tray click means.
    const active = getActiveServer();
    const win = active ? getServerWindow(active.id) : undefined;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

export function setUnreadCount(serverId: string, count: number): void {
  unreadByServer.set(serverId, count);
  applyUnreadTotal();
}

// A server whose window is gone would otherwise keep inflating the badge.
export function clearUnread(serverId: string): void {
  if (unreadByServer.delete(serverId)) applyUnreadTotal();
}

function applyUnreadTotal(): void {
  unreadTotal = [...unreadByServer.values()].reduce((a, b) => a + b, 0);

  // macOS/Linux (some DEs) dock badge; Windows doesn't have an app.setBadgeCount
  // equivalent, so the taskbar overlay icon below covers it there instead.
  app.setBadgeCount?.(unreadTotal);
  if (tray) {
    tray.setToolTip(unreadTotal > 0 ? `Hasht — ${unreadTotal} unread` : "Hasht");
  }

  if (process.platform === "win32") {
    const badge = unreadTotal > 0 ? getOverlayBadge() : null;
    const description = unreadTotal > 0 ? `${unreadTotal} unread` : "";
    for (const win of getAllServerWindows()) {
      if (!win.isDestroyed()) win.setOverlayIcon(badge, description);
    }
  }
}

export function refreshTrayMenu(opts: {
  onSwitchServer: (id: string) => void;
  onAddServer: () => void;
  onQuit: () => void;
}): void {
  rebuildMenu(opts);
}

function rebuildMenu(opts: {
  onSwitchServer: (id: string) => void;
  onAddServer: () => void;
  onQuit: () => void;
}): void {
  if (!tray) return;
  const servers: ServerEntry[] = listServers();
  const menu = Menu.buildFromTemplate([
    // No About dialog reachable from the login screen — this is the only way
    // to check which build is actually running.
    { label: `Hasht ${app.getVersion()}`, enabled: false },
    { type: "separator" as const },
    ...servers.map((s) => ({
      label:
        (unreadByServer.get(s.id) ?? 0) > 0
          ? `${s.name} (${unreadByServer.get(s.id)})`
          : s.name,
      click: () => opts.onSwitchServer(s.id),
    })),
    { type: "separator" as const },
    { label: "Manage Servers…", click: opts.onAddServer },
    { type: "separator" as const },
    { label: "Quit", click: opts.onQuit },
  ]);
  tray.setContextMenu(menu);
}
