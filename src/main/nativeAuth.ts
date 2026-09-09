import { dialog, net, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import os from "node:os";
import type { ServerEntry } from "./serverStore";

export const PROTOCOL = "hasht";

// Passkey sign-in handed off to the system browser, for platforms where an
// in-shell WebAuthn ceremony can't run (macOS Electron — electron#24573). The
// browser runs the ceremony and sends a one-time code back over `hasht://`.
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

  const res = await net.fetch(
    new URL("/api/auth/native/start", entry.url).toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge, device_label: os.hostname() }),
    },
  );
  if (res.status === 404) {
    throw new Error(
      "This server hasn't enabled desktop sign-in. Ask the admin to turn it on, or sign in with a password.",
    );
  }
  if (!res.ok) {
    throw new Error(`Couldn't start sign-in (${res.status}).`);
  }

  const { request_id, match_code } = (await res.json()) as {
    request_id: string;
    match_code: string;
  };
  pending.set(request_id, { serverId: entry.id, serverUrl: entry.url, verifier });

  // Show the code here so the user can check it against the one the browser
  // shows before they approve — a request they were lured into approving then
  // looks wrong. Native dialog, not the (untrusted) server page.
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Open browser", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    message: "Continue sign-in in your browser",
    detail: `Your browser will ask you to confirm this code:\n\n${formatMatchCode(
      match_code,
    )}`,
  });
  if (response !== 0) {
    pending.delete(request_id);
    return;
  }

  const target = new URL(entry.url);
  target.searchParams.set("native_auth", request_id);
  await shell.openExternal(target.toString());
}

/**
 * Redeems a `hasht://auth?request_id=…&code=…` callback. Returns null
 * for anything we weren't waiting for, so a stray or forged deep link is a
 * no-op rather than an error the user has to interpret.
 */
export async function completeBrowserSignIn(
  deepLink: string,
): Promise<AuthResult | null> {
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

  const handoff = pending.get(requestId);
  if (!handoff) return null;

  const res = await net.fetch(
    new URL("/api/auth/native/exchange", handoff.serverUrl).toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        code,
        verifier: handoff.verifier,
      }),
    },
  );
  // A wrong verifier now leaves the request redeemable server-side, so only
  // drop our copy once the exchange has actually succeeded — a lost response
  // on a flaky connection can then be retried.
  if (!res.ok) {
    throw new Error("That sign-in link didn't work — try again from the app.");
  }
  pending.delete(requestId);

  return { serverId: handoff.serverId, auth: await res.json() };
}

/** Pulls a deep link out of argv, which is how Windows and Linux deliver it. */
export function deepLinkFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}

function formatMatchCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1 ");
}
