const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const { hourCycleFromPattern } = require("../dist/main/clockFormat");

test("time patterns distinguish hour tokens from quoted literals", () => {
  for (const pattern of ["H:mm", "HH:mm", "HH.mm", "'h' HH:mm", "kk:mm"]) {
    assert.equal(hourCycleFromPattern(pattern), "h23");
  }
  for (const pattern of ["h:mm tt", "hh:mm tt", "'H' h:mm tt", "K:mm a"]) {
    assert.equal(hourCycleFromPattern(pattern), "h12");
  }
  assert.equal(hourCycleFromPattern("'H' mm"), undefined);
  assert.equal(hourCycleFromPattern(""), undefined);
});

function loadPreferences(platform, stdout = "", commandFails = false) {
  const exports = {};
  let calls = 0;
  const fakeRunFile = async (executable, args, options) => {
    calls++;
    if (platform === "win32") {
      assert.ok(executable.endsWith("powershell.exe"));
      assert.ok(args.includes("-NoProfile"));
      assert.ok(args.at(-1).includes("Get-Culture"));
      assert.equal(options.windowsHide, true);
    } else {
      assert.equal(executable, "/usr/bin/osascript");
      assert.ok(args.at(-1).includes('setLocalizedDateFormatFromTemplate("j")'));
    }
    assert.equal(options.timeout, 5000);
    if (commandFails) throw new Error("lookup failed");
    return { stdout };
  };
  const code = readFileSync(path.join(__dirname, "../dist/main/dateTimePreferences.js"), "utf8");
  vm.runInNewContext(code, {
    exports, process: { platform, env: {} },
    require(name) {
      if (name === "electron") return {
        app: { getSystemLocale: () => "en-US" },
      };
      if (name === "node:child_process") return { execFile: fakeRunFile };
      if (name === "node:util") return { promisify: (fn) => fn };
      if (name === "./clockFormat") return { hourCycleFromPattern };
      return require(name);
    },
  });
  return { read: exports.getDateTimePreferences, calls: () => calls };
}

test("Windows regional overrides and simultaneous window requests", async () => {
  const preferences = loadPreferences("win32", JSON.stringify({ locale: "en-US", timePattern: "HH:mm" }));
  const results = await Promise.all([preferences.read(), preferences.read()]);
  assert.equal(results[0].locale, "en-US");
  assert.equal(results[0].hourCycle, "h23");
  assert.equal(preferences.calls(), 1);
  await preferences.read();
  assert.equal(preferences.calls(), 2);
  const twelve = loadPreferences("win32", JSON.stringify({ locale: "en-GB", timePattern: "hh:mm tt" }));
  assert.equal((await twelve.read()).hourCycle, "h12");
});

test("macOS overrides and failed Windows lookup preserve locale fallback", async () => {
  assert.equal((await loadPreferences("darwin", "HH").read()).hourCycle, "h23");
  assert.equal((await loadPreferences("darwin", "h a").read()).hourCycle, "h12");
  for (const lookup of [loadPreferences("win32", "invalid JSON"), loadPreferences("win32", "", true), loadPreferences("darwin", "", true)]) {
    const result = await lookup.read();
    assert.equal(result.locale, "en-US");
    assert.equal(result.hourCycle, undefined);
  }
});
