/**
 * The recent-projects list kept on the device: which projects it shows, which it drops when it
 * is full or storage runs out, and how it words their age. Storage itself lives in the web app.
 */

/** How many projects the device keeps; saving one more drops the oldest. */
export const MAX_RECENT_PROJECTS = 12;

export type RecentEntry = { readonly id: string; readonly updatedAt: number };

/** Newest first; ties keep a stable order by id. */
export function sortRecent<T extends RecentEntry>(entries: readonly T[]): T[] {
  return entries.toSorted((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

/**
 * Ids to delete so at most `max` projects remain, oldest first. `keep` (the project just saved)
 * is never dropped, even when it is the oldest.
 */
export function recentToPrune(args: {
  readonly entries: readonly RecentEntry[];
  readonly max: number;
  readonly keep?: string;
}): string[] {
  const sorted = sortRecent(args.entries);
  const kept = args.keep === undefined ? undefined : sorted.find((e) => e.id === args.keep);
  const others = sorted.filter((e) => e !== kept);
  const room = Math.max(0, Math.floor(args.max) - (kept === undefined ? 0 : 1));
  return others.slice(room).map((e) => e.id);
}

/** The oldest project other than `keep`, to free space when a save runs out of quota. */
export function oldestRecent(args: {
  readonly entries: readonly RecentEntry[];
  readonly keep?: string;
}): string | null {
  const others = sortRecent(args.entries).filter((e) => e.id !== args.keep);
  return others.at(-1)?.id ?? null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * How long ago `time` was, short: "Just now", "2m ago", "1h ago", "3d ago", then the date
 * ("Mar 4", with the year when it differs). Times in the future read as "Just now".
 */
export function formatRelativeTime(args: { readonly time: number; readonly now: number }): string {
  const elapsed = args.now - args.time;
  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  const date = new Date(args.time);
  const label = `${MONTHS[date.getMonth()] ?? ""} ${date.getDate()}`;
  return date.getFullYear() === new Date(args.now).getFullYear()
    ? label
    : `${label}, ${date.getFullYear()}`;
}
