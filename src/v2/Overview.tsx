import React, { useMemo } from 'react'
import {
  ALL, Bench, Dataset, compact, dailySeries, delta, monthLabel, n0, n1, pct,
  perTx, prevMonth, venueIndex, venueCode,
} from '../lib'
import { Attention, Caveat, DeltaTag, JudgedKpi, Standfirst } from '../components/v2ui'

/**
 * The page the review did not have. Answers one question, "what needs my
 * attention", and demotes everything else to a drill-down. Closes VPC-FSR-002.
 */
export default function Overview({
  ds, bench, month, onGo,
}: {
  ds: Dataset; bench: Bench; month: string
  onGo: (tab: string, venue?: string) => void
}) {
  // A judgement needs a period and a period before it. With "all months"
  // selected we judge the latest complete month against the one before.
  const focus = month === ALL ? ds.months[ds.months.length - 1] : month
  const prior = prevMonth(ds, focus)

  const cur = bench.get(ALL, ALL, focus, 'all')
  const prev = prior ? bench.get(ALL, ALL, prior, 'all') : null
  const curMem = bench.get(ALL, ALL, focus, 'member')
  const prevMem = prior ? bench.get(ALL, ALL, prior, 'member') : null

  const dRev = delta(cur.rev, prev?.rev ?? NaN)
  const dTx = delta(cur.tx, prev?.tx ?? NaN)
  const dAtv = delta(perTx(cur), prev ? perTx(prev) : NaN)
  const dVis = delta(cur.vis, prev?.vis ?? NaN)
  const dMem = delta(curMem.ppl, prevMem?.ppl ?? NaN)

  // Venue movement, ranked. This is the answer to "who is off".
  const movers = useMemo(() => ds.venues.map(v => {
    const c = bench.get(v, ALL, focus, 'all')
    const p = prior ? bench.get(v, ALL, prior, 'all') : null
    return {
      venue: v,
      rev: c.rev,
      d: delta(c.rev, p?.rev ?? NaN),
      index: venueIndex(c.rev, cur.rev, ds.venues.length),
      atvD: delta(perTx(c), p ? perTx(p) : NaN),
      traded: c.tx > 0,
    }
  }).filter(m => m.traded), [ds, bench, focus, prior, cur.rev])

  const down = useMemo(() => movers.filter(m => m.d.hasBase && m.d.dir === -1).sort((a, b) => a.d.pct - b.d.pct), [movers])
  const up = useMemo(() => movers.filter(m => m.d.hasBase && m.d.dir === 1).sort((a, b) => b.d.pct - a.d.pct), [movers])

  // Small multiples: identical scale, so eleven venues compare at a glance
  // instead of fighting for space in one tangled chart. Closes the checklist
  // item that the twenty-column table could never satisfy.
  const sparks = useMemo(() => {
    const series = ds.venues.map(v => ({
      venue: v,
      pts: ds.months.map(m => bench.get(v, ALL, m, 'all').rev),
    })).filter(s => s.pts.some(p => p > 0))
    const max = Math.max(1, ...series.flatMap(s => s.pts))
    return { series, max }
  }, [ds, bench])

  // The single largest controllable cost in the dataset, surfaced where it can
  // be acted on rather than buried three tabs away.
  const promo = ds.promoImpacted.find(r => r.v === ALL && r.m === focus)
  const topTag = useMemo(() => ds.promoTag
    .filter(t => t.v === ALL && t.m === focus && t.c === 'Promotion')
    .sort((a, b) => b.disc - a.disc)[0], [ds, focus])

  const daily = useMemo(() => dailySeries(ds, ALL, focus), [ds, focus])
  const best = daily.reduce((a, x) => (x.rev > (a?.rev ?? -1) ? x : a), null as any)
  const worst = daily.filter(x => x.rev > 0).reduce((a, x) => (x.rev < (a?.rev ?? Infinity) ? x : a), null as any)
  const holidaysIn = daily.filter(d => d.holiday)

  return (
    <>
      <Standfirst
        question="What needs your attention this month?"
        sub={prior
          ? `${monthLabel(focus)} against ${monthLabel(prior)}, across all eleven venues. Everything below is ranked by how far it moved, not alphabetically.`
          : `${monthLabel(focus)}. This is the first month in the window, so there is nothing to compare it against yet.`}
      />

      <div className="kpis" style={{ marginBottom: 18 }}>
        <JudgedKpi hero label="Group revenue" value={compact(cur.rev)} delta={dRev}
          foot={prior ? <>vs {compact(prev!.rev)} in {monthLabel(prior)}</> : 'first month in window'} />
        <JudgedKpi label="Transactions" value={n0(cur.tx)} delta={dTx} />
        <JudgedKpi label="Average transaction" value={'$' + n1(perTx(cur))} delta={dAtv} />
        <JudgedKpi label="Visits" value={n0(cur.vis)} delta={dVis} />
        <JudgedKpi label="Active members" value={n0(curMem.ppl)} delta={dMem} />
      </div>

      {!prior && (
        <Caveat>
          {monthLabel(focus)} is the first month of available trade, so no comparison is possible.
          Pick a later month, or "all months", to see movement.
        </Caveat>
      )}

      {prior && (down.length > 0 || up.length > 0) && (
        <div className="grid g2" style={{ marginBottom: 16, alignItems: 'start' }}>
          <div className="card">
            <div className="card-t">Losing ground</div>
            <div className="card-s">Venues down on {monthLabel(prior)}, worst first.</div>
            {down.length === 0 && <div className="empty">No venue went backwards this month.</div>}
            {down.slice(0, 4).map((m, i) => (
              <Attention key={m.venue} rank={i + 1} tone="down" title={m.venue}
                detail={<>{compact(m.rev)} · <DeltaTag d={m.d} /> · {compact(m.d.abs)} of revenue{m.atvD.hasBase && m.atvD.dir === -1 ? ', and the average transaction fell too' : ''}</>}
                action={<button className="chip" onClick={() => onGo('trading', m.venue)}>Look at the days</button>} />
            ))}
          </div>
          <div className="card">
            <div className="card-t">Pulling ahead</div>
            <div className="card-s">Venues up on {monthLabel(prior)}, best first.</div>
            {up.length === 0 && <div className="empty">No venue grew this month.</div>}
            {up.slice(0, 4).map((m, i) => (
              <Attention key={m.venue} rank={i + 1} tone="up" title={m.venue}
                detail={<>{compact(m.rev)} · <DeltaTag d={m.d} /> · {compact(m.d.abs)} of revenue</>}
                action={<button className="chip" onClick={() => onGo('bench', m.venue)}>Break it down</button>} />
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-t">Every venue, same scale</div>
        <div className="card-s">
          Monthly revenue across the window. All eleven share one vertical scale, so the height of a line
          means the same thing everywhere and the shapes are directly comparable.
        </div>
        <div className="sparkgrid">
          {sparks.series.map(s => {
            const last = s.pts[ds.months.indexOf(focus)] ?? 0
            const prevV = prior ? s.pts[ds.months.indexOf(prior)] : NaN
            const d = delta(last, prevV)
            const w = 150, h = 44
            const step = w / Math.max(1, ds.months.length - 1)
            const path = s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (p / sparks.max) * h).toFixed(1)}`).join(' ')
            const fi = ds.months.indexOf(focus)
            return (
              <button key={s.venue} className="spark" onClick={() => onGo('bench', s.venue)}>
                <div className="spark-h">
                  <span className="tag">{venueCode(ds, s.venue)}</span>
                  <span className="spark-n">{s.venue}</span>
                  <DeltaTag d={d} />
                </div>
                <svg width={w} height={h} className="spark-svg">
                  <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
                  {fi >= 0 && (
                    <circle cx={fi * step} cy={h - (s.pts[fi] / sparks.max) * h} r={3}
                      fill="var(--accent)" stroke="var(--card)" strokeWidth={1.5} />
                  )}
                </svg>
                <div className="spark-v num">{compact(last)}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-t">The biggest lever you are not pulling</div>
          <div className="card-s">Discount given in {monthLabel(focus)}, and what it bought.</div>
          {promo ? (
            <>
              <div className="bigstat">
                <div className="bigstat-v num">{compact(promo.disc)}</div>
                <div className="bigstat-l">
                  given away across {n0(promo.txs)} transactions, {pct(cur.tx ? promo.txs / cur.tx : 0, 1)} of all trade
                </div>
              </div>
              {topTag && (
                <div className="attn flat" style={{ marginTop: 12 }}>
                  <div className="attn-body">
                    <div className="attn-title">{topTag.t} is the single largest</div>
                    <div className="attn-detail">
                      {compact(topTag.disc)} at a {pct(topTag.impRev + topTag.disc ? topTag.disc / (topTag.impRev + topTag.disc) : 0, 2)} effective
                      rate, touching {n0(topTag.txs)} transactions
                    </div>
                  </div>
                  <div className="attn-action">
                    <button className="chip on" onClick={() => onGo('whatif')}>Model cutting it</button>
                  </div>
                </div>
              )}
            </>
          ) : <div className="empty">No discount activity recorded for this month.</div>}
        </div>

        <div className="card">
          <div className="card-t">Best and worst day</div>
          <div className="card-s">The daily view is where variance gets explained. This is the headline from it.</div>
          {best && worst ? (
            <>
              <div className="daycmp">
                <div className="daycmp-row up">
                  <span className="daycmp-l">Best</span>
                  <span className="daycmp-d">{best.label}{best.holiday ? ` · ${best.holiday}` : ''}</span>
                  <span className="num daycmp-v">{compact(best.rev)}</span>
                </div>
                <div className="daycmp-row down">
                  <span className="daycmp-l">Quietest</span>
                  <span className="daycmp-d">{worst.label}{worst.holiday ? ` · ${worst.holiday}` : ''}</span>
                  <span className="num daycmp-v">{compact(worst.rev)}</span>
                </div>
              </div>
              <div className="card-s" style={{ marginTop: 12, marginBottom: 0 }}>
                {holidaysIn.length > 0
                  ? <>{holidaysIn.length} public holiday{holidaysIn.length > 1 ? 's' : ''} fell in {monthLabel(focus)}: {holidaysIn.map(h => h.holiday).join(', ')}. They are marked on the daily view.</>
                  : <>No public holidays fell in {monthLabel(focus)}.</>}
              </div>
              <button className="chip" style={{ marginTop: 12 }} onClick={() => onGo('trading')}>Open the daily view</button>
            </>
          ) : <div className="empty">No daily trade recorded for this month.</div>}
        </div>
      </div>
    </>
  )
}
