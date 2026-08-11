import React, { useMemo, useState } from 'react'
import { ALL, Dataset, compact, money, n0, n1, n2, pct } from '../lib'
import { Standfirst } from '../components/v2ui'
import { Controls, Dial, Finding, Method, Stat, StatGrid, Switcher } from '../components/thinkui'
import { mean, sd, tCrit } from '../stat'
import { days } from './data'
import { Scope, venuesOf } from './scope'

/**
 * Page six. Half teaching device, half register.
 *
 * The teaching device is the one pattern worth taking from Seeing Theory:
 * put the empirical and the theoretical on the same axes and give the reader
 * the sample size. Everything else in this edition is downstream of what that
 * picture shows — that precision improves like √n, and that a month of one
 * venue's trading is a small sample however large the revenue on it looks.
 *
 * The register is the part that keeps the edition honest: what was added, what
 * was removed, what was tried and dropped, and what this still cannot do.
 */
const W = 560, H = 190, PAD = 26

export default function How({ ds, scope }: { ds: Dataset; scope: Scope }) {
  const list = venuesOf(ds, scope)
  const [n, setN] = useState(28)
  const [pick, setPick] = useState<string>(list[0])
  const target = list.includes(pick) ? pick : list[0]

  const rows = useMemo(() => days(ds, target).map(d => d.rev), [ds, target])
  const m = mean(rows), s = sd(rows)

  // Empirical: resample n of this venue's real trading days, many times, and
  // keep the mean. Deterministic seed so the picture is stable.
  const sim = useMemo(() => {
    let a = 987654321 >>> 0
    const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const out: number[] = []
    for (let b = 0; b < 1500; b++) {
      let acc = 0
      for (let i = 0; i < n; i++) acc += rows[(rnd() * rows.length) | 0]
      out.push(acc / n)
    }
    return out
  }, [rows, n])

  const se = s / Math.sqrt(n)
  const moe = tCrit(0.95, Math.max(1, n - 1)) * se
  const lo = m - 4 * (s / Math.sqrt(3)), hi = m + 4 * (s / Math.sqrt(3))
  const BINS = 46
  const hist = useMemo(() => {
    const h = new Array(BINS).fill(0)
    for (const v of sim) {
      const i = Math.floor(((v - lo) / (hi - lo)) * BINS)
      if (i >= 0 && i < BINS) h[i]++
    }
    return h
  }, [sim, lo, hi])
  const hmax = Math.max(...hist, 1)
  const binW = (hi - lo) / BINS
  // Theoretical: Normal(m, s/√n), the central limit theorem's claim, scaled to
  // the same axes so the two can be read against each other.
  const dens = (x: number) => Math.exp(-((x - m) ** 2) / (2 * se * se)) / (se * Math.sqrt(2 * Math.PI))
  const theory = Array.from({ length: 121 }, (_, i) => lo + (i / 120) * (hi - lo))
  const tmax = dens(m) || 1
  const px = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - PAD * 2)

  return (
    <>
      <Standfirst
        question="How this edition thinks"
        sub="Every method used, what it can carry, and what was deliberately left out. Nothing on the other five pages does anything this page does not name."
      />

      <div className="card">
        <div className="card-t">Why a month cannot tell you much</div>
        <div className="card-s">
          Take {target}'s real trading days, draw {n} of them at random, and average. Do that fifteen hundred times.
          The bars are what actually happens. The curve is what the arithmetic says should happen — the same shape, from
          nothing but the venue's own spread divided by the square root of how many days you looked at.
        </div>

        <Controls note={
          <>Drag it. Doubling the days does not halve the error, it divides it by 1.41 — you need four times the days for
          twice the precision. That single fact is why a monthly report is nearly always too short a window to see a
          change in, and why the comparison window on the first page matters more than any chart on it.</>
        }>
          <Dial label="Days observed" value={n} min={3} max={Math.min(120, rows.length)} display={n + ' days'}
            hint={n <= 31 ? 'about a month' : n <= 62 ? 'about two months' : 'about ' + Math.round(n / 30) + ' months'}
            onChange={setN} />
          <Switcher label="Venue" value={target} onChange={setPick}
            options={list.slice(0, 6).map(v => ({ k: v, label: v.split(' ')[0] }))} />
        </Controls>

        <svg viewBox={`0 0 ${W} ${H}`} className="clt">
          {hist.map((c, i) => (
            <rect key={i} x={px(lo + i * binW)} y={H - PAD - (c / hmax) * (H - PAD * 2)}
              width={Math.max(1, (W - PAD * 2) / BINS - 1)} height={(c / hmax) * (H - PAD * 2)} className="cltbar" />
          ))}
          <path className="cltline" d={theory.map((x, i) => `${i === 0 ? 'M' : 'L'}${px(x).toFixed(1)},${(H - PAD - (dens(x) / tmax) * (H - PAD * 2)).toFixed(1)}`).join(' ')} />
          <line x1={px(m)} y1={PAD - 8} x2={px(m)} y2={H - PAD} className="cltmid" />
          <line x1={px(m - moe)} y1={H - PAD} x2={px(m + moe)} y2={H - PAD} className="cltmoe" />
          <text x={px(m)} y={PAD - 12} textAnchor="middle" className="axis">{compact(m)}</text>
          <text x={px(lo)} y={H - 8} className="axis">{compact(lo)}</text>
          <text x={px(hi)} y={H - 8} textAnchor="end" className="axis">{compact(hi)}</text>
        </svg>

        <StatGrid>
          <Stat label="A typical day here" value={compact(m)} foot={`spread ±${compact(s)} from day to day, over ${rows.length} trading days`} />
          <Stat label="Margin of error on the average" value={'±' + compact(moe)} foot={`at ${n} days, 95%`} />
          <Stat label="As a percentage" value={'±' + n1((moe / m) * 100) + '%'}
            foot={moe / m > 0.05 ? 'anything smaller than this is not visible at this window' : 'tight enough to act on a small change'} />
          <Stat label="Days needed to halve it" value={n0(n * 4)} foot="precision improves with the square root, never with the count" />
        </StatGrid>

        <div className="legend">
          <span><i style={{ background: 'var(--accent)' }} />What actually happens, resampled from real days</span>
          <span><i style={{ background: 'var(--pos)' }} />What the arithmetic predicts, Normal(mean, s/√n)</span>
        </div>
      </div>

      <Finding>
        At <b>{n} days</b>, {target}'s average trading day can only be pinned down to <b>±{n1((moe / m) * 100)}%</b>.
        Every percentage printed anywhere in this review that is smaller than that is inside the measurement error of the
        thing it claims to measure.
      </Finding>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-t">The five rules this edition follows</div>
          <div className="reasoning" style={{ marginTop: 8 }}>
            <ol className="rules">
              <li><b>Ship an estimate with its range, or ship nothing.</b> A number without a range cannot be acted on, because it cannot be wrong.</li>
              <li><b>Three states, never two.</b> Moved, within normal, and not enough data. The third is a finding, not a gap.</li>
              <li><b>Never accept the null.</b> "Not detectable" is not "did not happen". Every page that says it also says how large a change would have had to be.</li>
              <li><b>A comparison is not a cause.</b> Members spend more is a description of two groups. What membership does is a different question, and this data cannot answer it.</li>
              <li><b>Name the comparison.</b> Every judgement says what it was judged against — its own past, its own weekday, its own resampled days. Never "the average", unless the average has been shown to mean something.</li>
            </ol>
          </div>
        </div>

        <div className="card">
          <div className="card-t">Where the method comes from</div>
          <div className="card-s">
            Rebuilt from the mathematics, not lifted. The visualisations in the source are educational-use only; the
            formulas are not anyone's property.
          </div>
          <div className="tw flat">
            <table className="v2t">
              <thead><tr className="head"><th className="l">Idea</th><th className="l">Where it lands here</th></tr></thead>
              <tbody>
                <tr><td className="l">Central limit theorem, s/√n</td><td className="l">the window dial on Did anything happen, and the picture above</td></tr>
                <tr><td className="l">Interval estimation, coverage</td><td className="l">the expected range on Normal days, and its false-alarm count</td></tr>
                <tr><td className="l">The bootstrap</td><td className="l">every interval on Fair comparison, where no closed form exists</td></tr>
                <tr><td className="l">Prediction vs confidence interval</td><td className="l">the √(1 + 1/k) on Normal days — the wider one, deliberately</td></tr>
                <tr><td className="l">Correlation, and Anscombe</td><td className="l">the weather scatter on Why, drawn rather than summarised</td></tr>
                <tr><td className="l">Between and within groups</td><td className="l">“the calendar explains 87% of it”, on Normal days</td></tr>
                <tr><td className="l">Aggregation and Simpson's paradox</td><td className="l">the three answers on Members</td></tr>
                <tr><td className="l">Power and detectable effect</td><td className="l">“smallest move you could detect”, on Did anything happen</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">Tried, and not shipped</div>
        <div className="card-s">Recorded because a report that only lists what it contains is not a methodology.</div>
        <div className="reasoning">
          <ul>
            <li>
              <b>Shrinking small venues toward the group mean.</b> The estimated prior weight came out near zero: at Feros's
              transaction volumes the differences between venues are three orders of magnitude larger than the sampling
              error inside one, so shrinkage moves nothing. It is the right tool for a product where a site can have twenty
              observations. Here it would have been decoration.
            </li>
            <li>
              <b>p-values on the surface.</b> They are misread by people who compute them for a living. The pages carry
              intervals and states instead. The p-value still exists underneath and is what the state is derived from.
            </li>
            <li>
              <b>Same period last year.</b> The warehouse carries meaningful Feros trade from January 2026 only. A
              year-on-year column would have been the most requested and most fictional number in the build.
            </li>
            <li>
              <b>A single "health score" per venue.</b> Composite scores hide the trade-off that produced them and cannot
              be given an interval anyone can interpret. Five named measures with ranges beat one number with a colour.
            </li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">What this still cannot do, and what would fix it</div>
        <div className="reasoning">
          <ul>
            <li>
              <b>It cannot tell you what caused anything.</b> Every split on Why is an accounting identity and every
              comparison is between groups that formed themselves. The fix is not more statistics, it is design: a holdout
              on a campaign, a staggered rollout, a price change scheduled rather than reacted to. Ten per cent of an
              audience held back for a week converts the entire promotions page from arithmetic into measurement.
            </li>
            <li>
              <b>It cannot measure a promotion.</b> Both files carry promoted transactions only, so there is no baseline
              cohort. Before running one, the number worth computing is the smallest lift the audience could detect — with
              a few hundred people per arm that is around ten percentage points, which usually means the honest answer is
              a stated before-and-after and no claim of incrementality.
            </li>
            <li>
              <b>It treats days as independent, and they are not.</b> A quiet week is one event, not seven. Intervals built
              this way are slightly narrower than the truth. Blocking the resample by week is the fix and it is a day of work.
            </li>
            <li>
              <b>It has no intraday grain in the judgement.</b> Arrivals are a counting process; staffing to the average
              hour fails about one hour in fourteen by arithmetic alone. The heat map exists; the model on top of it does not.
            </li>
          </ul>
        </div>
      </div>

      <Method title="The dataset underneath, unchanged" formula={`${ds.meta.venues} venues · ${ds.meta.revenueCentres} revenue centres · ${ds.meta.window[0]} to ${ds.meta.window[1]}
source ${ds.meta.source}
trade day starts 04:00 · weather is a nearest-station proxy ending ${ds.meta.wxEnds}`}>
        <p>
          Thinking reads exactly the same extract as Classic and New. No measure has been redefined, no row filtered and
          no figure adjusted. Everything different about these six pages is a different question asked of the same numbers,
          which is the point: the data was never the constraint.
        </p>
      </Method>
    </>
  )
}
