import Store from "electron-store";
import { randomUUID } from "node:crypto";

export interface ServerEntry {
  id: string;
  url: string;
  name: string; // defaults to the hostname if not given
}

interface StoreShape {
  servers: ServerEntry[];
  activeServerId: string | null;
}

// electron-store persists to userData/config.json — separate from the app's
// own IndexedDB/localStorage, which lives in each server's own session
// partition (see windows.ts). This only holds "which servers has the user
// added" — never credentials; auth stays in the per-server session cookie.
const store = new Store<StoreShape>({
  defaults: { servers: [], activeServerId: null },
});

export function listServers(): ServerEntry[] {
  return store.get("servers");
}

export function getActiveServer(): ServerEntry | null {
  const id = store.get("activeServerId");
  if (!id) return null;
  return listServers().find((s) => s.id === id) ?? null;
}

export function addServer(rawUrl: string, name?: string): ServerEntry {
  const url = normalizeUrl(rawUrl);
  const entry: ServerEntry = {
    id: randomUUID(),
    url,
    name: name?.trim() || new URL(url).hostname,
  };
  const servers = [...listServers(), entry];
  store.set("servers", servers);
  store.set("activeServerId", entry.id);
  return entry;
}

export function removeServer(id: string): void {
  const servers = listServers().filter((s) => s.id !== id);
  store.set("servers", servers);
  if (store.get("activeServerId") === id) {
    store.set("activeServerId", servers[0]?.id ?? null);
  }
}

export function setActiveServer(id: string): void {
  if (listServers().some((s) => s.id === id)) {
    store.set("activeServerId", id);
  }
}

export function renameServer(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const servers = listServers().map((s) => (s.id === id ? { ...s, name: trimmed } : s));
  store.set("servers", servers);
}

export function hasScheme(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export function normalizeUrl(input: string, defaultScheme: "https" | "http" = "https"): string {
  const withScheme = hasScheme(input) ? input : `${defaultScheme}://${input}`;
  const url = new URL(withScheme); // throws on garbage input — caller should catch
  url.hash = "";
  url.search = "";
  url.pathname = "/";
  return url.toString();
}
