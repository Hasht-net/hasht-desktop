const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * Ad-hoc sign macOS builds when no real signing identity is configured.
 *
 * Without any signature at all, macOS refuses a downloaded .app outright with
 * "the application is damaged and can't be opened" — a dead end that only
 * offers to move it to the Trash. Apple Silicon additionally requires every
 * binary to carry *some* valid signature just to execute.
 *
 * An ad-hoc signature (`--sign -`) fixes both: the app becomes runnable, and
 * Gatekeeper downgrades to the ordinary "Apple could not verify this app is
 * free of malware" prompt, which the user can get past via Open Anyway in
 * System Settings. It is not a substitute for notarization — that needs a
 * Developer ID — it just turns an unopenable download into an openable one.
 *
 * `--options runtime` + `--entitlements` matter too, not just "does it run":
 * without hardened runtime active, camera/mic access (which hardened runtime
 * gates on these same entitlement keys, separately from App Sandbox) fails
 * silently, and screen-recording TCC — keyed to the app's code identity —
 * gets flakier about ever registering/re-prompting when the identity behind
 * it isn't the one actually granted. Ad-hoc still means a new identity every
 * rebuild (no Developer ID to anchor it), so that flakiness isn't fully fixed
 * here — only real signing/notarization fixes it for good.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  // A real identity is configured, so electron-builder is doing the signing
  // properly and must not be overwritten with a weaker ad-hoc signature.
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;

  // For a --universal build, electron-builder runs afterPack once per source
  // arch (into a "*-temp" appOutDir) before merging them, then once more on
  // the merged result. Signing the per-arch intermediates makes their sealed
  // resources diverge just enough that the merge step refuses to combine them
  // ("Expected all non-binary files to have identical SHAs"). Only the final
  // output needs a signature.
  if (context.appOutDir.endsWith("-temp")) return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const entitlements = path.join(__dirname, "entitlements.mac.plist");

  // --deep is deprecated for real distribution signing but is still the way
  // to ad-hoc sign the nested Electron frameworks and helper apps in one go.
  // It applies this same entitlements file to them too — broader than the
  // main/inherit split electron-builder does with a real identity, but
  // harmless (the extra keys are inert for a helper process that never uses
  // them) and far simpler than re-signing each nested bundle individually.
  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--options",
      "runtime",
      "--entitlements",
      entitlements,
      "--sign",
      "-",
      appPath,
    ],
    { stdio: "inherit" },
  );
};
