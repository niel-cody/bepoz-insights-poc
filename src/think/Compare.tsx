import React, { useMemo, useState } from 'react'
import { ALL, Bench, Dataset, compact, money2, n0, n1, n2, pct, venueCode } from '../lib'
import { Standfirst } from '../components/v2ui'
import { Controls, EstimatePlot, EstimateRow, Finding, Ledger, Method, Stat, StatGrid, Switcher, Verdict } from '../components/thinkui'
import { bootstrapCI, mean, median, quantile } from '../stat'
import { CONF_STEPS, Day, days } from './data'

/**
 * Page three, and the reason this edition exists.
 *
 * The New edition put an "index 100 = group average" bar against every venue.
 * Eleven venues that differ by a factor of seven in size, by forty-four to two
 * in revenue centres, and by seven months to three in trading history, were all
 * compared against the arithmetic mean of themselves. This page shows what that
 * number is actually made of, and what can honestly stand in its place.
 */

interface Measure {
  k: string; label: string; unit: string
  num: (d: Day) => number
  den: (d: Day) => number
  fmt: (v: number) => string
  sizeFree: boolean
  note: string
}

const MEASURES: Measure[] = [
  {
    k: 'rev', label: 'Revenue', unit: 'total', num: d => d.rev, den: () => 0,
    fmt: compact, sizeFree: false,
    note: 'The measure the index was built on. It is a size ordering — a bigger venue takes more money — and every venue in the group already knows where it sits on it.',
  },
  {
    k: 'perday', label: 'Revenue per trading day', unit: 'a day', num: d => d.rev, den: () => 1,
    fmt: compact, sizeFree: false,
    note: 'Still a size measure, but it no longer punishes a venue for having opened in May. This alone changes the ordering, because the index was quietly comparing seven months of trade with three.',
  },
  {
    k: 'atv', label: 'Revenue per transaction', unit: 'a transaction', num: d => d.rev, den: d => d.tx,
    fmt: v => '$' + n2(v), sizeFree: true,
    note: 'What one sale is worth. A small venue can lead the group on this, and here one does — which is information the index cannot carry.',
  },
  {
    k: 'pv', label: 'Revenue per visit', unit: 'a visit', num: d => d.rev, den: d => d.vis,
    fmt: v => '$' + n2(v), sizeFree: true,
    note: 'What one person is worth on one day at one venue. The closest thing in this dataset to "how well is this venue trading", independent of how many people walk in.',
  },
  {
    k: 'mem', label: 'Member share of transactions', unit: 'of transactions', num: d => d.memtx, den: d => d.tx,
    fmt: v => pct(v, 1), sizeFree: true,
    note: 'Identified trade as a share of all trade. A penetration rate, not a volume, so a bottle shop and a bistro can sit on the same axis.',
  },
]

export default function Compare({ ds, bench, month, onGo }: { ds: Dataset; bench: Bench; month: string; onGo: (t: string, v?: string) => void }) {
  const [mk, setMk] = useState('pv')
  const [confIdx, setConfIdx] = useState(2)
  const conf = CONF_STEPS[confIdx]
  const M = MEASURES.find(m => m.k === mk)!

  const perVenue = useMemo(() => {
    return ds.venues.map(v => {
      const all = days(ds, v)
      const rows = month === ALL ? all : all.filter(d => d.d.slice(0, 7) === month)
      return { venue: v, rows, allRows: all }
    }).filter(r => r.rows.length > 0)
  }, [ds, month])

  const stats = useMemo(() => perVenue.map(({ venue, rows }) => {
    const total = rows.reduce((a, d) => a + M.num(d), 0)
    const denom = rows.reduce((a, d) => a + M.den(d), 0)
    const point = M.k === 'rev' ? total : denom ? total / denom : NaN
    // A ratio estimator resampled over trading days: the interval answers
    // "how much of this ranking is the particular days we happened to observe".
    const interval = M.k === 'rev'
      ? { point, lo: NaN, hi: NaN, conf }
      : bootstrapCI(
          rows.map((_, i) => i),
          idx => {
            let n = 0, d0 = 0
            for (const i of idx) { n += M.num(rows[i]); d0 += M.den(rows[i]) }
            return d0 ? n / d0 : NaN
          },
          conf, 600, 7919,
        )
    return { venue, point, lo: interval.lo, hi: interval.hi, n: rows.length, rev: rows.reduce((a, d) => a + d.rev, 0) }
  }).filter(s => isFinite(s.point)), [perVenue, M, conf])

  // The ledger critiques the index, which is built on revenue, so it needs the
  // revenue distribution regardless of which measure is being shown.
  const revs = stats.map(s => s.rev)
  const revMean = mean(revs)
  const revBelow = revs.filter(v => v <= revMean).length

  const values = stats.map(s => s.point)
  const avg = mean(values), med = median(values)
  const aboveAvg = values.filter(v => v > avg).length
  const skew = med ? avg / med : NaN

  // Ranks, for the shuffle. Revenue is the index's ordering by construction.
  const revRank = useMemo(() => {
    const s = [...stats].sort((a, b) => b.rev - a.rev)
    return new Map(s.map((x, i) => [x.venue, i + 1]))
  }, [stats])
  const mRank = useMemo(() => {
    const s = [...stats].sort((a, b) => b.point - a.point)
    return new Map(s.map((x, i) => [x.venue, i + 1]))
  }, [stats])
  const biggestShift = [...stats].sort((a, b) =>
    Math.abs(revRank.get(b.venue)! - mRank.get(b.venue)!) - Math.abs(revRank.get(a.venue)! - mRank.get(a.venue)!))[0]

  // How separable is the ranking? Two venues whose intervals overlap are not
  // ordered by the evidence, however confidently the table lists them.
  const sorted = [...stats].sort((a, b) => b.point - a.point)
  const separable = sorted.slice(0, -1).filter((s, i) => isFinite(s.lo) && s.lo > sorted[i + 1].hi).length

  const rows: EstimateRow[] = sorted.map(s => ({
    key: s.venue,
    label: s.venue,
    sub: `${s.n} trading days${M.k === 'rev' ? '' : ''}`,
    point: s.point, lo: s.lo, hi: s.hi,
    kind: isFinite(s.lo) ? 'within' : 'thin',
    value: M.fmt(s.point),
    onClick: () => onGo('normal', s.venue),
  }))

  // Absolute-scale plot rather than a difference plot: rebuild the axis around
  // the group's own range so the intervals are readable.
  const lim = { lo: Math.min(...sorted.map(s => (isFinite(s.lo) ? s.lo : s.point))), hi: Math.max(...sorted.map(s => (isFinite(s.hi) ? s.hi : s.point))) }

  return (
    <>
      <Standfirst
        question="What is a fair thing to compare a venue against?"
        sub="Not the group average. Eleven venues that differ sevenfold in size, from two revenue centres to eight, and from three months of trading history to seven, do not share a meaningful average."
      />

      <Controls note={M.note}>
        <Switcher label="Measure" value={mk} onChange={setMk} options={MEASURES.map(m => ({ k: m.k, label: m.label }))} />
        <Switcher label="Confidence" value={String(confIdx)} onChange={k => setConfIdx(+k)}
          options={CONF_STEPS.map((c, i) => ({ k: String(i), label: Math.round(c * 100) + '%' }))} />
      </Controls>

      <Finding tone={M.sizeFree ? 'flat' : 'down'}>
        On <b>{M.label.toLowerCase()}</b>, <b>{aboveAvg} of {stats.length}</b> venues sit above the group average and
        {' '}{stats.length - aboveAvg} below.
        {isFinite(skew) && Math.abs(skew - 1) > 0.08
          ? <> The average is {pct(Math.abs(skew - 1), 0)} {skew > 1 ? 'above' : 'below'} the middle venue, because a
            handful of venues at one end pull it there. An index built on it puts most of the group on the same side of 100
            and calls that a finding.</>
          : <> The average and the middle venue are within a few per cent of each other here, so a comparison against the
            average is at least meaningful on this measure — which it is not on revenue.</>}
      </Finding>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">Where the group actually sits</div>
        <div className="card-s">
          Every venue on one axis, with the mean and the median marked. The distance between those two marks is how
          misleading “versus average” is on this measure.
        </div>
        <div className="strip">
          {(() => {
            const lo = Math.min(...values), hi = Math.max(...values)
            const px = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
            return (
              <>
                <div className="strip-track">
                  <i className="strip-line" />
                  <i className="strip-mark mean" style={{ left: px(avg) + '%' }} title={'mean ' + M.fmt(avg)} />
                  <i className="strip-mark med" style={{ left: px(med) + '%' }} title={'median ' + M.fmt(med)} />
                  {(() => {
                    // Chips collide when two venues sit close together; stagger
                    // rather than overlap, so no venue is hidden by another.
                    const ordered = [...stats].sort((a, b) => a.point - b.point)
                    let lastPx = -Infinity, row = 0
                    return ordered.map(s => {
                      const at = px(s.point)
                      if (at - lastPx < 4) row = (row + 1) % 3; else row = 0
                      lastPx = at
                      return (
                        <button key={s.venue} className={'strip-dot' + (s.point > avg ? ' over' : '')}
                          style={{ left: at + '%', top: 6 + row * 20 }}
                          title={`${s.venue} · ${M.fmt(s.point)}`}
                          onClick={() => onGo('normal', s.venue)}>
                          <span>{venueCode(ds, s.venue)}</span>
                        </button>
                      )
                    })
                  })()}
                </div>
                <div className="strip-axis">
                  <span>{M.fmt(lo)}</span>
                  <span className="strip-key">
                    <i className="k mean" /> mean {M.fmt(avg)}
                    <i className="k med" /> median {M.fmt(med)}
                  </span>
                  <span>{M.fmt(hi)}</span>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      <StatGrid>
        <Stat label="Venues above the average" value={`${aboveAvg} of ${stats.length}`}
          tone={aboveAvg <= stats.length * 0.4 ? 'bad' : ''}
          foot={aboveAvg <= stats.length * 0.4
            ? 'an average that most of the group sits below is a description of the largest venues, not of the group'
            : 'balanced enough that the average describes something real on this measure'} />
        <Stat label="Average ÷ middle venue" value={n2(skew)}
          foot={skew > 1.15 ? 'heavily pulled by the top of the group' : skew > 1.05 ? 'mildly pulled upward' : 'close to symmetric on this measure'} />
        <Stat label="Ranks the evidence separates" value={`${separable} of ${Math.max(0, sorted.length - 1)}`}
          foot="adjacent pairs whose intervals do not overlap. The rest are ties being printed as an order." />
        <Stat label="Biggest rank change from revenue"
          value={biggestShift ? `${revRank.get(biggestShift.venue)} → ${mRank.get(biggestShift.venue)}` : '—'}
          foot={biggestShift ? biggestShift.venue : ''} />
      </StatGrid>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-t">The index only ever told you who was biggest</div>
          <div className="card-s">
            Left: the order the index produces, which is the revenue order exactly. Right: the order on {M.label.toLowerCase()}.
            Lines that cross are venues the index was hiding.
          </div>
          <div className="slope">
            <div className="slope-h"><span>By revenue (the index)</span><span>By {M.label.toLowerCase()}</span></div>
            <svg width={320} height={stats.length * 24 + 10} viewBox={`0 0 320 ${stats.length * 24 + 10}`} className="slopesvg">
              {stats.map(s => {
                const a = revRank.get(s.venue)!, b = mRank.get(s.venue)!
                const y1 = a * 24 - 13, y2 = b * 24 - 13
                const moved = a !== b
                return (
                  <g key={s.venue} className={'slopeg' + (moved ? ' moved' : '')}>
                    <line x1={92} y1={y1} x2={228} y2={y2} />
                    <text x={86} y={y1 + 4} textAnchor="end">{a}. {venueCode(ds, s.venue)}</text>
                    <text x={234} y={y2 + 4}>{b}. {venueCode(ds, s.venue)}</text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        <div className="card">
          <div className="card-t">And an estimate is itself uncertain</div>
          <div className="card-s">
            {M.label} for each venue, with the range you would get from a different but equally valid set of that venue's
            own trading days. Where two bars overlap, the order between them is not something this data can settle.
          </div>
          <div className="est abs">
            <div className="est-axis">
              <span style={{ left: 0 }}>{M.fmt(lim.lo)}</span>
              <span style={{ right: 0 }}>{M.fmt(lim.hi)}</span>
            </div>
            {sorted.map(s => {
              const px = (v: number) => ((v - lim.lo) / (lim.hi - lim.lo || 1)) * 100
              return (
                <div className="est-row" key={s.venue} style={{ height: 32 }}>
                  <div className="est-lab">{s.venue}<span className="est-sub">{s.n} days</span></div>
                  <div className="est-track">
                    {isFinite(s.lo)
                      ? <i className="est-bar v-quiet" style={{ left: px(s.lo) + '%', width: Math.max(0.6, px(s.hi) - px(s.lo)) + '%' }} />
                      : <span className="est-none">no interval at this grain</span>}
                    <i className="est-dot v-quiet" style={{ left: px(s.point) + '%' }} />
                  </div>
                  <div className="est-val num">{M.fmt(s.point)}</div>
                </div>
              )
            })}
          </div>
          <div className="chart-note">
            Resampled from each venue's own trading days, {Math.round(conf * 100)}% interval, 600 resamples with a fixed
            seed so the same page always shows the same range.
          </div>
        </div>
      </div>

      <Ledger
        where="the New edition"
        was={<>Put a bar against each venue reading <b>index 100 = group average</b>, so “a venue at 140 is doing 1.4 times an average venue's trade”.</>}
        is={<>
          That index is total revenue divided by the mean of eleven venues' total revenue. It reproduces the revenue
          column's ordering exactly, so it adds nothing; the mean it divides by sits above {stats.length - aboveAvg} of the
          {' '}{stats.length} venues; and it charges The Wilton for opening in May. A venue can only be compared with
          itself over time, with the group's common movement removed, or on a rate that does not contain its size.
        </>}
      />

      <Method formula={`ratio measure     Σ numerator over the venue's days ÷ Σ denominator over the same days
interval          percentile bootstrap over trading days, 600 resamples, seed fixed
separability      adjacent ranks are separated only when lo(i) > hi(i+1)`}>
        <p>
          The interval is bootstrapped rather than derived, because none of these measures is a mean of independent draws
          and none has an honest closed-form standard error. Resampling the days needs no such assumption: if you can
          compute the measure, you can compute the spread of it.
        </p>
        <p>
          <b>What this does not say.</b> It is a range over which days were observed, not over which customers were
          served, so it does not capture the fact that trading days are correlated with each other; the true range is a
          little wider than the one drawn. It carries no causal content at all — a venue leading on revenue per visit may
          simply sell a more expensive product, and this page cannot tell those apart.
        </p>
        <p>
          <b>One thing deliberately absent.</b> Shrinking small venues toward the group mean was tested and dropped.
          At Feros's volumes the between-venue differences are three orders of magnitude larger than the sampling error
          within a venue, so the estimated prior weight comes out near zero and shrinkage moves nothing. It belongs in a
          product where a venue can have twenty observations; it does not belong here, and shipping it would have been
          decoration.
        </p>
      </Method>
    </>
  )
}
