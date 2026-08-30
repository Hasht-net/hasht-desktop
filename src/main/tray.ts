import { Tray, Menu, nativeImage, app } from "electron";
import path from "node:path";
import { getActiveServer, listServers, ServerEntry } from "./serverStore";
import { getServerWindow } from "./windows";

let tray: Tray | null = null;
let unreadTotal = 0;
const unreadByServer = new Map<string, number>();

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
  // equivalent, so the tray icon/tooltip below is the cross-platform fallback.
  app.setBadgeCount?.(unreadTotal);
  if (tray) {
    tray.setToolTip(unreadTotal > 0 ? `Hasht — ${unreadTotal} unread` : "Hasht");
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
    ...servers.map((s) => ({
      label:
        (unreadByServer.get(s.id) ?? 0) > 0
          ? `${s.name} (${unreadByServer.get(s.id)})`
          : s.name,
      click: () => opts.onSwitchServer(s.id),
    })),
    { type: "separator" as const },
    { label: "Manage Backends…", click: opts.onAddServer },
    { type: "separator" as const },
    { label: "Quit", click: opts.onQuit },
  ]);
  tray.setContextMenu(menu);
}
