export type HourCycle = "h12" | "h23";

// Native time patterns use h/K for 12-hour and H/k for 24-hour clocks.
// Quoted literals can contain either character without describing an hour.
export function hourCycleFromPattern(pattern: string): HourCycle | undefined {
  const hours = pattern.replace(/'([^']|'')*'/g, "").match(/[hHkK]/)?.[0];
  return hours === "H" || hours === "k" ? "h23" : hours === "h" || hours === "K" ? "h12" : undefined;
}
