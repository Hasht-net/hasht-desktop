import { app, Menu, MenuItemConstructorOptions, shell } from "electron";
import { listServers, ServerEntry } from "./serverStore";

export interface AppMenuCallbacks {
  onSwitchServer: (id: string) => void;
  onManageBackends: () => void;
  onQuit: () => void;
}

// Without a real menu, Electron falls back to a generic "Electron" template
// with no way into server management short of the tray. This also gives the
// server window a Cmd/Ctrl+K accelerator for it, since that window's content
// is the self-hosted web app and isn't ours to add a button to.
export function buildAppMenu(callbacks: AppMenuCallbacks): void {
  const isMac = process.platform === "darwin";
  const servers: ServerEntry[] = listServers();

  const serverItems: MenuItemConstructorOptions[] = servers.map((s) => ({
    label: s.name,
    click: () => callbacks.onSwitchServer(s.id),
  }));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { label: "Quit", accelerator: "Cmd+Q", click: callbacks.onQuit },
            ],
          },
        ]
      : []),
    {
      label: "Backends",
      submenu: [
        {
          label: "Manage Backends…",
          accelerator: "CmdOrCtrl+K",
          click: callbacks.onManageBackends,
        },
        ...(serverItems.length
          ? ([{ type: "separator" as const }, ...serverItems] as MenuItemConstructorOptions[])
          : []),
        ...(isMac
          ? []
          : ([{ type: "separator" as const }, { label: "Quit", accelerator: "Ctrl+Q", click: callbacks.onQuit }] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(isMac ? [{ role: "zoom" as const }, { type: "separator" as const }, { role: "front" as const }] : [{ role: "close" as const }]),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: () => shell.openExternal("https://github.com/Hasht-net/hasht-desktop"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
