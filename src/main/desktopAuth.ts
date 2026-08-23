import { net, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import os from "node:os";
import type { ServerEntry } from "./serverStore";

export const PROTOCOL = "hasht";

// Passkey sign-in, handed off to the system browser: Electron ships no
// WebAuthn authenticator UI (electron/electron#24573), so a ceremony started
// in a server window hangs forever. The browser runs it and sends back a
// one-time code over the `hasht://` scheme.
//
// Any app can claim that scheme, so the code alone is deliberately useless:
// redeeming it also requires the verifier, which never leaves this process.
interface PendingHandoff {
  serverId: string;
  serverUrl: string;
  verifier: string;
}

const pending = new Map<string, PendingHandoff>();

export interface AuthResult {
  serverId: string;
  /** The server's own auth response, passed through to the page untouched. */
  auth: unknown;
}

/** Opens the browser leg. Resolves once the browser has been launched. */
export async function beginBrowserSignIn(entry: ServerEntry): Promise<void> {
  const verifier = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("hex");

  const res = await net.fetch(new URL("/api/auth/desktop/start", entry.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge, device_label: os.hostname() }),
  });
  if (!res.ok) {
    throw new Error(`Couldn't start sign-in (${res.status}).`);
  }

  const { request_id } = (await res.json()) as { request_id: string };
  pending.set(request_id, { serverId: entry.id, serverUrl: entry.url, verifier });

  const target = new URL(entry.url);
  target.searchParams.set("desktop_auth", request_id);
  await shell.openExternal(target.toString());
}

/**
 * Redeems a `hasht://auth?request_id=…&code=…` callback. Returns null
 * for anything we weren't waiting for, so a stray or forged deep link is a
 * no-op rather than an error the user has to interpret.
 */
export async function completeBrowserSignIn(deepLink: string): Promise<AuthResult | null> {
  let url: URL;
  try {
    url = new URL(deepLink);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:` || url.hostname !== "auth") return null;

  const requestId = url.searchParams.get("request_id");
  const code = url.searchParams.get("code");
  if (!requestId || !code) return null;

  // Single-use on this side too: whatever the outcome, the verifier is spent.
  const handoff = pending.get(requestId);
  pending.delete(requestId);
  if (!handoff) return null;

  const res = await net.fetch(
    new URL("/api/auth/desktop/exchange", handoff.serverUrl).toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, code, verifier: handoff.verifier }),
    },
  );
  if (!res.ok) {
    throw new Error("That sign-in link has expired — try again from the app.");
  }

  return { serverId: handoff.serverId, auth: await res.json() };
}

/** Pulls a deep link out of argv, which is how Windows and Linux deliver it. */
export function deepLinkFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}
