import { contextBridge, ipcRenderer } from "electron";

// Runs inside the untouched app page with contextIsolation on — this is the
// only bridge between a (possibly untrusted, self-hosted-by-someone-else)
// server's page and the privileged main process. Keep this list minimal:
// mirrors Mattermost Desktop's approach of a locked-down preload rather than
// exposing ipcRenderer/Node directly to the renderer.
contextBridge.exposeInMainWorld("chatDesktop", {
  isDesktopApp: true,
  // Passkeys can't run in Electron, so the web app calls this instead of
  // starting a ceremony that would hang; the browser does it and hands back
  // a session the page collects via takePendingAuth on its next load.
  startPasskeySignIn: () => ipcRenderer.invoke("desktop-auth:start"),
  takePendingAuth: () => ipcRenderer.invoke("desktop-auth:take"),
  // Screen sharing. The capture itself goes through getDisplayMedia (the main
  // process installs the handler that answers it); these two cover the part
  // the page can't see — macOS grants screen recording to the app, and neither
  // the status nor the way back from a denial is reachable from a web page.
  getScreenCaptureStatus: () => ipcRenderer.invoke("screen-capture:status"),
  openScreenCaptureSettings: () =>
    ipcRenderer.invoke("screen-capture:open-settings"),
});

// The app already renders unread *channel* count (not message count) into
// document.title as "(N) ..." (see frontend/src/App.vue) for the browser-tab
// case. Reuse that signal for the tray badge/icon instead of asking the web
// app to change anything.
function reportTitle() {
  const match = document.title.match(/^\((\d+)\)/);
  const unread = match ? parseInt(match[1], 10) : 0;
  ipcRenderer.send("unread-count-changed", unread);
}

// Supplied by the main process (see additionalArguments in windows.ts) rather
// than hardcoded, because the height differs per platform — Windows caption
// buttons don't fit in macOS's 28px.
function titlebarHeight(): number {
  const arg = process.argv.find((a) => a.startsWith("--titlebar-height="));
  const parsed = arg ? parseInt(arg.split("=")[1], 10) : NaN;
  return Number.isFinite(parsed) ? parsed : 28;
}

// Tells the page it is running frameless so it can reserve room for the
// window controls and mark a drag region. The app owns the layout; the shell
// only supplies the flag and the height.
window.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement;
  root.style.setProperty("--desktop-titlebar-h", `${titlebarHeight()}px`);
  root.classList.add("desktop-shell");
});

window.addEventListener("DOMContentLoaded", () => {
  reportTitle();
  // Observe <head> rather than <title> directly: if the SPA ever replaces
  // the title element instead of mutating its text, a direct observer would
  // go silently dead. Also covers <title> not existing yet at DOMContentLoaded.
  new MutationObserver(reportTitle).observe(document.head, {
    subtree: true,
    childList: true,
    characterData: true,
  });
});
