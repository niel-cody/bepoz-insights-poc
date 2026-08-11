// ---------------------------------------------------------------------------
// Shared data preparation for the Thinking edition.
//
// Every page reads from the same daily grain, because a month is not an
// observation — it is a bag of twenty-eight to thirty-one observations, and
// throwing that away is what leaves a report unable to say whether anything
// happened.
// ---------------------------------------------------------------------------
import { ALL, Dataset, dailySeries } from '../lib'

export interface Day {
  d: string; label: string; dow: number
  rev: number; tx: number; vis: number; memtx: number
  tmax: number | null; mm: number | null
  holiday: string | null
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const dowShort = (n: number) => DOW_SHORT[n]

/** The whole window for one venue (or the group), trading days only. */
export function days(ds: Dataset, venue: string): Day[] {
  return dailySeries(ds, venue, ALL)
    .filter(d => d.rev > 0)
    .map(d => ({
      d: d.d, label: d.label, dow: d.dow,
      rev: d.rev, tx: d.tx, vis: d.vis, memtx: d.memtx,
      tmax: d.tmax, mm: d.mm, holiday: d.holiday,
    }))
}

/** Day type for the calendar decomposition: a public holiday is its own kind of
 *  day, not an unusual Monday. */
export const dayType = (d: Day) => (d.holiday ? 'Public holiday' : DOW_SHORT[d.dow])

export const DAY_TYPES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Public holiday']

export const inMonth = (rows: Day[], m: string) => rows.filter(r => r.d.slice(0, 7) === m)

/** The last date the venue traded on or before the end of the selected month. */
export function anchorDate(rows: Day[], month: string): string | null {
  const pool = month === ALL ? rows : rows.filter(r => r.d.slice(0, 7) <= month)
  return pool.length ? pool[pool.length - 1].d : null
}

const shiftDays = (iso: string, n: number) => {
  const t = new Date(iso + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Two adjacent windows of N calendar days ending at the anchor. Adjacent, not
 *  overlapping, so the comparison is of independent observations. */
export function windows(rows: Day[], anchor: string, n: number): { base: Day[]; now: Day[]; from: string; mid: string } {
  const mid = shiftDays(anchor, -n)
  const from = shiftDays(anchor, -2 * n)
  return {
    base: rows.filter(r => r.d > from && r.d <= mid),
    now: rows.filter(r => r.d > mid && r.d <= anchor),
    from, mid,
  }
}

export const revs = (rows: Day[]) => rows.map(r => r.rev)

/** Nice short date for a label. */
export function shortDate(iso: string): string {
  const t = new Date(iso + 'T00:00:00')
  return t.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()]
}

export const CONF_STEPS = [0.8, 0.9, 0.95, 0.99]
