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
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  // A real identity is configured, so electron-builder is doing the signing
  // properly and must not be overwritten with a weaker ad-hoc signature.
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // --deep is deprecated for real distribution signing but is still the way
  // to ad-hoc sign the nested Electron frameworks and helper apps in one go.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
};
