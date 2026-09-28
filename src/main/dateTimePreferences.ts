import { app } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { hourCycleFromPattern, type HourCycle } from "./clockFormat";

const runFile = promisify(execFile);

interface DateTimePreferences {
  locale: string;
  hourCycle?: HourCycle;
}

let pending: Promise<DateTimePreferences> | undefined;

// Coalesce requests from multiple server windows; no renderer-controlled
// command, registry key, or preference name crosses this bridge.
export function getDateTimePreferences(): Promise<DateTimePreferences> {
  return pending ??= readPreferences().finally(() => { pending = undefined; });
}

async function readPreferences(): Promise<DateTimePreferences> {
  const preferences: DateTimePreferences = { locale: app.getSystemLocale() };
  try {
    if (process.platform === "darwin") {
      // Foundation's flexible hour template includes the effective 12/24-hour
      // override. Importing Foundation needs no app automation permissions.
      const { stdout } = await runFile("/usr/bin/osascript", ["-l", "JavaScript", "-e",
        'ObjC.import("Foundation"); var formatter = $.NSDateFormatter.alloc.init; formatter.setLocalizedDateFormatFromTemplate("j"); ObjC.unwrap(formatter.dateFormat);',
      ], { encoding: "utf8", timeout: 5000, maxBuffer: 4096 });
      preferences.hourCycle = hourCycleFromPattern(stdout.trim());
    } else if (process.platform === "win32") {
      // Get-Culture includes the user's regional overrides, unlike Intl's
      // locale defaults. Run asynchronously so focusing a window never blocks UI.
      const executable = path.join(process.env.SystemRoot ?? "C:\\Windows",
        "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const { stdout } = await runFile(executable, ["-NoProfile", "-NonInteractive", "-Command",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $culture = Get-Culture; @{ locale = $culture.Name; timePattern = $culture.DateTimeFormat.ShortTimePattern } | ConvertTo-Json -Compress",
      ], { encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 4096 });
      const result = JSON.parse(stdout.replace(/^\uFEFF/, ""));
      if (typeof result.locale === "string" && result.locale) preferences.locale = result.locale;
      if (typeof result.timePattern === "string") preferences.hourCycle = hourCycleFromPattern(result.timePattern);
    }
  } catch {
    // A failed OS lookup leaves the system locale available as a fallback.
  }
  return preferences;
}
