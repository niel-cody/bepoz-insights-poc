// ---------------------------------------------------------------------------
// scope.ts — what the filter bar produces, and what the pages consume.
//
// One object describes everything the reader has chosen: which months, which
// venues, and (where the data can carry it) which revenue centres. Every
// Thinking page takes this and nothing else, so "what am I looking at" has a
// single answer and the page can state it in words.
// ---------------------------------------------------------------------------
import { ALL, Bench, Cell, Dataset } from '../lib'
import { Day, days } from './data'

/** A contiguous run of months, inclusive. from === to is a single month. */
export interface Period { from: string; to: string }

export interface Scope {
  period: Period
  /** Venues in play. Never empty — an empty selection means the whole group. */
  venues: string[]
  /** Revenue centres, within a single venue. Empty means the whole venue. */
  rcs: string[]
}

export const monthsIn = (ds: Dataset, p: Period) =>
  ds.months.filter(m => m >= p.from && m <= p.to)

export const isWholeWindow = (ds: Dataset, p: Period) =>
  p.from === ds.months[0] && p.to === ds.months[ds.months.length - 1]

export const isSingleMonth = (p: Period) => p.from === p.to

export const wholeWindow = (ds: Dataset): Period => ({ from: ds.months[0], to: ds.months[ds.months.length - 1] })

export const latestMonth = (ds: Dataset): Period => {
  const m = ds.months[ds.months.length - 1]
  return { from: m, to: m }
}

export const defaultScope = (ds: Dataset): Scope => ({ period: wholeWindow(ds), venues: [], rcs: [] })

/** The venues actually in play: an empty selection is the whole group. */
export const venuesOf = (ds: Dataset, s: Scope) => (s.venues.length ? s.venues : ds.venues)

export const isWholeGroup = (ds: Dataset, s: Scope) => s.venues.length === 0 || s.venues.length === ds.venues.length

// ---------------------------------------------------------------------------
// Daily series for a selection
//
// The dataset ships a pre-summed '*' row for the whole group. Any other
// selection has to be summed here, by date, because a subset of venues is not
// a row anyone precomputed.
// ---------------------------------------------------------------------------
const cache = new WeakMap<Dataset, Map<string, Day[]>>()

export function scopedDays(ds: Dataset, s: Scope): Day[] {
  const list = venuesOf(ds, s)
  const key = (isWholeGroup(ds, s) ? ALL : [...list].sort().join('|')) + '::' + s.period.from + '::' + s.period.to
  let byDs = cache.get(ds)
  if (!byDs) { byDs = new Map(); cache.set(ds, byDs) }
  const hit = byDs.get(key)
  if (hit) return hit

  const inPeriod = (d: Day) => d.d.slice(0, 7) >= s.period.from && d.d.slice(0, 7) <= s.period.to

  let out: Day[]
  if (isWholeGroup(ds, s)) {
    out = days(ds, ALL).filter(inPeriod)
  } else if (list.length === 1) {
    out = days(ds, list[0]).filter(inPeriod)
  } else {
    // Sum the venues day by day. Weather and holidays are properties of the
    // date, not of the venue, so they carry across; the weather proxy differs
    // per venue and is therefore dropped rather than averaged into a fiction.
    const acc = new Map<string, Day>()
    for (const v of list) {
      for (const d of days(ds, v)) {
        if (!inPeriod(d)) continue
        const cur = acc.get(d.d)
        if (cur) {
          cur.rev += d.rev; cur.tx += d.tx; cur.vis += d.vis; cur.memtx += d.memtx
        } else {
          acc.set(d.d, { ...d, tmax: null, mm: null })
        }
      }
    }
    out = [...acc.values()].sort((a, b) => (a.d < b.d ? -1 : 1))
  }
  byDs.set(key, out)
  return out
}

/** The selection's whole history, ignoring the period. Windows that look back
 *  past the start of the chosen period need this: picking July should not stop
 *  July being compared with June. */
export const scopeHistory = (ds: Dataset, s: Scope) => scopedDays(ds, { ...s, period: wholeWindow(ds) })

/** Daily series for one venue, honouring the period but not the venue selection. */
export function venueDays(ds: Dataset, venue: string, p: Period): Day[] {
  return days(ds, venue).filter(d => d.d.slice(0, 7) >= p.from && d.d.slice(0, 7) <= p.to)
}

// ---------------------------------------------------------------------------
// Benchmark cube over a period
//
// Most measures are additive across months. Persons are not: someone who drank
// here in January and again in February is one person over the window and two
// if you add the months up. The dataset carries a correct '*' row for the whole
// window, so that is used when the period is the whole window, and `ppl` is
// returned as NaN for any partial range rather than quietly over-counted.
// ---------------------------------------------------------------------------
export interface RangeCell extends Cell { pplExact: boolean }

const ADDITIVE: (keyof Cell)[] = ['tx', 'rev', 'disc', 'vis', 'items', 'food', 'bev', 'card', 'cash', 'vouch', 'comp', 'acct']

export function benchRange(ds: Dataset, bench: Bench, venue: string, rc: string, p: Period, seg: 'all' | 'member' | 'nonmember'): RangeCell {
  if (isWholeWindow(ds, p)) {
    const c = bench.get(venue, rc, ALL, seg)
    return { ...c, pplExact: true }
  }
  const ms = monthsIn(ds, p)
  if (ms.length === 1) {
    const c = bench.get(venue, rc, ms[0], seg)
    return { ...c, pplExact: true }
  }
  const out: any = { tx: 0, rev: 0, disc: 0, ppl: NaN, vis: 0, items: 0, food: 0, bev: 0, card: 0, cash: 0, vouch: 0, comp: 0, acct: 0, pplExact: false }
  for (const m of ms) {
    const c = bench.get(venue, rc, m, seg)
    for (const f of ADDITIVE) out[f] += c[f] || 0
  }
  return out as RangeCell
}

/** Sum a measure over the venues (and revenue centres) in scope. */
export function scopedBench(ds: Dataset, bench: Bench, s: Scope, seg: 'all' | 'member' | 'nonmember'): RangeCell {
  const vs = venuesOf(ds, s)
  const parts: RangeCell[] = []
  for (const v of vs) {
    if (s.rcs.length && vs.length === 1) {
      for (const rc of s.rcs) parts.push(benchRange(ds, bench, v, rc, s.period, seg))
    } else {
      parts.push(benchRange(ds, bench, v, ALL, s.period, seg))
    }
  }
  if (parts.length === 1) return parts[0]
  const out: any = { tx: 0, rev: 0, disc: 0, ppl: NaN, vis: 0, items: 0, food: 0, bev: 0, card: 0, cash: 0, vouch: 0, comp: 0, acct: 0, pplExact: false }
  for (const p of parts) for (const f of ADDITIVE) out[f] += p[f] || 0
  return out as RangeCell
}

// ---------------------------------------------------------------------------
// Labels. The scope has to be sayable, not just selectable.
// ---------------------------------------------------------------------------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthName = (m: string) => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4)

export function periodLabel(ds: Dataset, p: Period): string {
  if (isWholeWindow(ds, p)) return 'All months'
  if (isSingleMonth(p)) return monthName(p.from)
  return monthName(p.from) + ' – ' + monthName(p.to)
}

export function venueLabel(ds: Dataset, s: Scope): string {
  if (isWholeGroup(ds, s)) return 'All venues'
  if (s.venues.length === 1) {
    return s.rcs.length ? `${s.venues[0]} › ${s.rcs.length === 1 ? s.rcs[0] : s.rcs.length + ' centres'}` : s.venues[0]
  }
  return `${s.venues[0]} +${s.venues.length - 1}`
}

/** The sentence under the bar. Every page inherits it. */
export function scopeSentence(ds: Dataset, s: Scope): string {
  const vs = venuesOf(ds, s)
  const d = scopedDays(ds, s)
  const bits = [
    periodLabel(ds, s.period),
    isWholeGroup(ds, s) ? `all ${ds.venues.length} venues` : vs.length === 1 ? vs[0] : `${vs.length} venues`,
  ]
  if (s.rcs.length && vs.length === 1) {
    // Trading days come from the daily table, which is venue-level, so quoting
    // a day count next to a revenue centre would attribute the venue's days to
    // the centre. Say what is actually being measured instead.
    bits.push(s.rcs.length === 1 ? s.rcs[0] : `${s.rcs.length} of ${(ds.rcs[vs[0]] || []).length} revenue centres`)
    bits.push('monthly cube only')
  } else {
    bits.push(`${d.length} trading day${d.length === 1 ? '' : 's'}`)
  }
  return bits.join(' · ')
}
