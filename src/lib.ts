// ---------------------------------------------------------------------------
// Types, loading, selectors and formatting for the Feros Strategic Review.
// Measure definitions mirror the original POC methodology (see Methodology tab).
// ---------------------------------------------------------------------------

export type Seg = 'all' | 'member' | 'nonmember'

export interface BenchRow {
  v: string; rc: string; m: string; s: 'member' | 'nonmember'
  tx: number; rev: number; disc: number; ppl: number; vis: number
  items: number; food: number; bev: number
  card: number; cash: number; vouch: number; comp: number; acct: number
}

export interface Dataset {
  meta: { org: string; source: string; orgId: string; window: [string, string]; venues: number; revenueCentres: number; built: string; wxEnds?: string }
  venues: string[]
  rcs: Record<string, string[]>
  months: string[]
  bench: BenchRow[]
  daypart: { v: string; m: string; k: string; tx: number; rev: number; vis: number; items: number; food: number; bev: number }[]
  dow: { v: string; m: string; k: number; tx: number; rev: number; vis: number }[]
  hourly: { v: string; m: string; k: number; tx: number; rev: number }[]
  heatmap: Record<string, string>
  freq: { venue: string; month: string; cohort: string; persons: number; visits: number; tx: number; revenue: number }[]
  flow: { venue: string; month: string; persons: number; visits: number; revenue: number; new: number; returning: number }[]
  retention: { venue: string; month: string; retained: number; base: number }[]
  venuespread: { venues: number; members: number }[]
  pairs: { a: string; b: string; n: number }[]
  promoTag: { v: string; m: string; c: string; t: string; txs: number; impRev: number; disc: number; lines: number }[]
  promoImpacted: { v: string; m: string; txs: number; rev: number; disc: number; memTxs: number }[]
  crossover: { v: string; m: string; p: string; visits: number; rev: number; tx: number; mem: number }[]
  products: { v: string; n: string; t: string; qty: number; rev: number; cost: number; price: number }[]
  daily: { v: string; d: string; tx: number; rev: number; vis: number; memtx: number }[]
  wx: { p: string; d: string; tmax: number; mm: number }[]
  wxmap: { v: string; p: string; km: number; ok: number }[]
  hol: { d: string; n: string }[]
}

export const ALL = '*'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const nf = new Intl.NumberFormat('en-AU')
export const n0 = (x: number) => (x == null || !isFinite(x) ? '—' : nf.format(Math.round(x)))
export const n1 = (x: number) => (x == null || !isFinite(x) ? '—' : x.toFixed(1))
export const n2 = (x: number) => (x == null || !isFinite(x) ? '—' : x.toFixed(2))
export const money = (x: number) => (x == null || !isFinite(x) ? '—' : (x < 0 ? '-$' : '$') + nf.format(Math.abs(Math.round(x))))
export const money2 = (x: number) => (x == null || !isFinite(x) ? '—' : (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(2))
export const pct = (x: number, d = 1) => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(d) + '%')
export const compact = (x: number) => {
  if (x == null || !isFinite(x)) return '—'
  const a = Math.abs(x)
  const sign = x < 0 ? '-' : ''
  if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'b'
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2) + 'm'
  if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(0) + 'k'
  return sign + '$' + Math.round(a)
}
export const compactN = (x: number) => {
  if (x == null || !isFinite(x)) return '—'
  const a = Math.abs(x)
  if (a >= 1e6) return (x / 1e6).toFixed(2) + 'm'
  if (a >= 1e3) return (x / 1e3).toFixed(1) + 'k'
  return String(Math.round(x))
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (m: string) => (m === ALL ? 'All months' : MON[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4))
export const monthShort = (m: string) => (m === ALL ? 'All' : MON[+m.slice(5, 7) - 1])
export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// venue short code — the POC used 3-letter venue codes, derived here from the
// revenue-centre naming convention ("HIG Lounge Bar" -> HIG).
export function venueCode(ds: Dataset, venue: string): string {
  if (venue === ALL) return 'GRP'
  const rc = (ds.rcs[venue] || [])[0]
  if (rc) {
    const first = rc.split(' ')[0]
    if (first.length <= 4 && first === first.toUpperCase()) return first
  }
  return venue.slice(0, 3).toUpperCase()
}

// ---------------------------------------------------------------------------
// Benchmark selectors
// ---------------------------------------------------------------------------
export interface Cell {
  tx: number; rev: number; disc: number; ppl: number; vis: number
  items: number; food: number; bev: number
  card: number; cash: number; vouch: number; comp: number; acct: number
}
const ZERO: Cell = { tx: 0, rev: 0, disc: 0, ppl: 0, vis: 0, items: 0, food: 0, bev: 0, card: 0, cash: 0, vouch: 0, comp: 0, acct: 0 }
const FIELDS: (keyof Cell)[] = ['tx', 'rev', 'disc', 'ppl', 'vis', 'items', 'food', 'bev', 'card', 'cash', 'vouch', 'comp', 'acct']

function addInto(a: Cell, b: BenchRow | Cell): Cell {
  const o: any = { ...a }
  for (const f of FIELDS) o[f] = (o[f] || 0) + ((b as any)[f] || 0)
  return o
}

export class Bench {
  private idx = new Map<string, Cell>()
  constructor(rows: BenchRow[]) {
    for (const r of rows) this.idx.set(`${r.v}|${r.rc}|${r.m}|${r.s}`, r as unknown as Cell)
  }
  /** Leaf lookup. Members + non-members are disjoint person sets, so 'all' = sum. */
  get(v: string, rc: string, m: string, s: Seg): Cell {
    if (s === 'all') {
      const a = this.idx.get(`${v}|${rc}|${m}|member`)
      const b = this.idx.get(`${v}|${rc}|${m}|nonmember`)
      if (!a && !b) return ZERO
      return addInto(addInto(ZERO, a || ZERO), b || ZERO)
    }
    return this.idx.get(`${v}|${rc}|${m}|${s}`) || ZERO
  }
}

// Derived metrics — identical formulas to the POC Benchmark table.
export const perPerson = (c: Cell) => (c.ppl ? c.rev / c.ppl : NaN)
export const perVisit = (c: Cell) => (c.vis ? c.rev / c.vis : NaN)
export const perTx = (c: Cell) => (c.tx ? c.rev / c.tx : NaN)
export const perItem = (c: Cell) => (c.items ? c.rev / c.items : NaN)
export const visPerPerson = (c: Cell) => (c.ppl ? c.vis / c.ppl : NaN)
export const txPerPerson = (c: Cell) => (c.ppl ? c.tx / c.ppl : NaN)
export const txPerVisit = (c: Cell) => (c.vis ? c.tx / c.vis : NaN)
export const itemsPerTx = (c: Cell) => (c.tx ? c.items / c.tx : NaN)
export const tender = (c: Cell) => c.card + c.cash + c.vouch + c.comp + c.acct

// ---------------------------------------------------------------------------
// Trading selectors
// ---------------------------------------------------------------------------
export function pickTrading<T extends { v: string; m: string }>(rows: T[], v: string, m: string): T[] {
  return rows.filter(r => r.v === v && r.m === m)
}

export interface HeatCell { d: number; h: number; tx: number; rev: number }
/** Heatmap ships at (venue, month) leaf grain; rollups are summed client-side. */
export function heatCells(ds: Dataset, venue: string, month: string): HeatCell[] {
  const acc = new Map<number, HeatCell>()
  for (const key of Object.keys(ds.heatmap)) {
    const [v, m] = key.split('~')
    if (venue !== ALL && v !== venue) continue
    if (month !== ALL && m !== month) continue
    for (const part of ds.heatmap[key].split(';')) {
      if (!part) continue
      const [d, h, tx, rev] = part.split(',').map(Number)
      const k = d * 100 + h
      const cur = acc.get(k) || { d, h, tx: 0, rev: 0 }
      cur.tx += tx; cur.rev += rev * 10  // revenue is stored in tens of dollars
      acc.set(k, cur)
    }
  }
  return [...acc.values()]
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------
export const PROMO_CATS = ['Promotion', 'Member', 'Voucher', 'Staff', 'Manual'] as const
export const CAT_COLOR: Record<string, string> = {
  Promotion: 'var(--s1)', Member: 'var(--s2)', Voucher: 'var(--s3)', Staff: 'var(--s4)', Manual: 'var(--s5)',
}

// ---------------------------------------------------------------------------
// Baselines
//
// v2's organising principle is that every page opens with a judgement, not a
// number, and a judgement needs something to judge against. Two baselines are
// available without leaving the dataset: the previous month, and the venue's
// share of the group. Same-period-last-year is deliberately absent because the
// warehouse only carries meaningful Feros trade from January 2026 — inventing
// it would be exactly the confident-looking chart the house rules forbid.
// ---------------------------------------------------------------------------
export interface Delta { abs: number; pct: number; dir: 1 | 0 | -1; hasBase: boolean }

/** Grey inside ±3%, coloured outside, per the Oolio Insights delta spec. */
export const DELTA_DEADBAND = 0.03

export function delta(current: number, base: number): Delta {
  if (!isFinite(base) || base === 0) return { abs: NaN, pct: NaN, dir: 0, hasBase: false }
  const abs = current - base
  const pct = abs / base
  return { abs, pct, dir: Math.abs(pct) < DELTA_DEADBAND ? 0 : pct > 0 ? 1 : -1, hasBase: true }
}

export const prevMonth = (ds: Dataset, m: string): string | null => {
  const i = ds.months.indexOf(m)
  return i > 0 ? ds.months[i - 1] : null
}

/** Index against the group average per venue. 100 = exactly average. */
export function venueIndex(value: number, groupTotal: number, venueCount: number): number {
  const avg = groupTotal / venueCount
  return avg ? (value / avg) * 100 : NaN
}

// ---------------------------------------------------------------------------
// Daily series, with weather and holiday context joined
// ---------------------------------------------------------------------------
export interface DailyPoint {
  d: string; label: string; dow: number
  tx: number; rev: number; vis: number; memtx: number
  tmax: number | null; mm: number | null
  holiday: string | null
  roll7: number
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The proxy serving the most venues, used when the view is the whole group. */
function groupProxy(ds: Dataset): string | undefined {
  const count = new Map<string, number>()
  for (const w of ds.wxmap) count.set(w.p, (count.get(w.p) || 0) + 1)
  let best: string | undefined, n = 0
  for (const [p, c] of count) if (c > n) { best = p; n = c }
  return best
}

export function dailySeries(ds: Dataset, venue: string, month: string): DailyPoint[] {
  const hol = new Map(ds.hol.map(h => [h.d, h.n]))
  const proxy = venue === ALL ? groupProxy(ds) : ds.wxmap.find(w => w.v === venue)?.p
  const wx = new Map<string, { tmax: number; mm: number }>()
  if (proxy) for (const w of ds.wx) if (w.p === proxy) wx.set(w.d, { tmax: w.tmax, mm: w.mm })

  const rows = ds.daily
    .filter(r => r.v === venue && (month === ALL || r.d.slice(0, 7) === month))
    .sort((a, b) => (a.d < b.d ? -1 : 1))

  return rows.map((r, i) => {
    const w = wx.get(r.d)
    const from = Math.max(0, i - 6)
    const window = rows.slice(from, i + 1)
    const dt = new Date(r.d + 'T00:00:00')
    return {
      d: r.d,
      label: dt.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()],
      dow: dt.getDay(),
      tx: r.tx, rev: r.rev, vis: r.vis, memtx: r.memtx,
      tmax: w ? w.tmax : null,
      mm: w ? w.mm : null,
      holiday: hol.get(r.d) || null,
      roll7: window.reduce((a, x) => a + x.rev, 0) / window.length,
    }
  })
}

/** How far the weather context travelled, so it is never passed off as measured. */
export function weatherProvenance(ds: Dataset, venue: string) {
  if (venue === ALL) {
    const p = groupProxy(ds)
    if (!p) return null
    const serves = ds.wxmap.filter(w => w.p === p)
    return {
      proxy: p, km: NaN, group: true, servesVenues: serves.length,
      locationConfirmed: true, endsAt: ds.meta.wxEnds,
      spread: Math.max(...ds.wxmap.map(w => w.km)),
    }
  }
  const m = ds.wxmap.find(w => w.v === venue)
  return m ? { proxy: m.p, km: m.km, group: false, servesVenues: 1, locationConfirmed: !!m.ok, endsAt: ds.meta.wxEnds, spread: m.km } : null
}

export const dowName = (n: number) => DOW_SHORT[n]

// ---------------------------------------------------------------------------
// Loading
//
// The dataset ships as a gzipped, string-pooled, columnar payload (~122 KB on
// the wire against ~900 KB of raw JSON). Labels are interned into a pool and
// referenced by index; each table is an array of numeric rows plus a schema
// describing its columns. It is expanded back into plain objects here so the
// rest of the app never sees the encoding.
// ---------------------------------------------------------------------------
interface Packed {
  meta: Dataset['meta']
  p: string[]
  schema: Record<string, { cols: string[]; str: string[] }>
  venues: number[]
  months: number[]
  rcs: Record<string, number[]>
  heatmap: Record<string, string>
  [table: string]: any
}

function expand(c: Packed): Dataset {
  const P = c.p
  const out: any = { meta: c.meta }
  for (const [name, spec] of Object.entries(c.schema)) {
    const strs = new Set(spec.str)
    out[name] = (c[name] as any[][]).map(row => {
      const o: any = {}
      spec.cols.forEach((col, i) => { o[col] = strs.has(col) ? P[row[i]] : row[i] })
      return o
    })
  }
  out.venues = c.venues.map(i => P[i])
  out.months = c.months.map(i => P[i])
  out.rcs = Object.fromEntries(Object.entries(c.rcs).map(([k, v]) => [P[+k], v.map(i => P[i])]))
  out.heatmap = Object.fromEntries(Object.entries(c.heatmap).map(([k, v]) => [P[+k], v]))

  // Hourly totals are not shipped — they are the heatmap summed over days, which
  // is identical regardless of the 4am day-attribution rule.
  const hourly = new Map<string, { v: string; m: string; k: number; tx: number; rev: number }>()
  const bump = (v: string, m: string, k: number, tx: number, rev: number) => {
    const id = `${v}|${m}|${k}`
    const cur = hourly.get(id) || { v, m, k, tx: 0, rev: 0 }
    cur.tx += tx; cur.rev += rev
    hourly.set(id, cur)
  }
  for (const key of Object.keys(out.heatmap)) {
    const [v, m] = key.split('~')
    for (const part of out.heatmap[key].split(';')) {
      if (!part) continue
      const [, h, tx, rev] = part.split(',').map(Number)
      const r = rev * 10
      bump(v, m, h, tx, r); bump(v, ALL, h, tx, r); bump(ALL, m, h, tx, r); bump(ALL, ALL, h, tx, r)
    }
  }
  out.hourly = [...hourly.values()]
  return out as Dataset
}

async function gunzip(buf: ArrayBuffer | Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot decompress the dataset')
  const stream = new Blob([buf as any]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

// ---------------------------------------------------------------------------
// Access control
//
// The dataset is AES-256-GCM encrypted with a key derived from the shared
// password (PBKDF2-SHA256, 310k iterations, per-build random salt). The
// password is NOT stored anywhere in the bundle — the only thing shipped is
// ciphertext, so an incorrect password fails GCM authentication and there is
// nothing to read without it. This is a real gate, not a hidden page.
//
// Layout of dataset.enc:  salt[16] | iv[12] | ciphertext+tag
// ---------------------------------------------------------------------------
const PBKDF2_ITERATIONS = 310_000

let cachedPayload: Uint8Array | null = null

async function encryptedPayload(): Promise<Uint8Array> {
  if (cachedPayload) return cachedPayload
  const inline = (globalThis as any).__FEROS_DATA__ as string | undefined
  if (inline) {
    const bin = atob(inline)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    cachedPayload = bytes
    return bytes
  }
  const res = await fetch('dataset.enc')
  if (!res.ok) throw new Error('dataset unavailable')
  cachedPayload = new Uint8Array(await res.arrayBuffer())
  return cachedPayload
}

export class WrongPassword extends Error {
  constructor() { super('wrong password'); this.name = 'WrongPassword' }
}

export async function unlock(password: string): Promise<Dataset> {
  if (!globalThis.crypto?.subtle) throw new Error('this browser cannot decrypt the dataset (needs a secure context)')
  const payload = await encryptedPayload()
  const salt = payload.slice(0, 16)
  const iv = payload.slice(16, 28)
  const body = payload.slice(28)

  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  )

  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body)
  } catch {
    throw new WrongPassword()   // GCM auth tag mismatch — the only check needed
  }
  return expand(JSON.parse(await gunzip(plain)))
}
