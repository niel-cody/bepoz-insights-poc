import React, { useMemo, useState } from 'react'
import {
  ALL, Bench, CAT_COLOR, Dataset, PROMO_CATS, compact, delta, money, monthLabel, monthShort, n0, n1, pct, prevMonth,
} from '../lib'
import { Section } from '../components/ui'
import { Caveat, DeltaTag, JudgedKpi, Sortable, Standfirst } from '../components/v2ui'
import { Bar, BarChart, CartesianGrid, Legend, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: '#6E6890', fontSize: 11 }
const grid = { stroke: '#221F35' }

function TT({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="tt">
      <div style={{ fontWeight: 620, marginBottom: 5 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="num">
          <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.color, marginRight: 6 }} />
          <span className="k">{p.name}</span>&nbsp;&nbsp;{fmt ? fmt(p.value) : n0(p.value)}
        </div>
      ))}
    </div>
  )
}

/**
 * v1 put 24 KPI tiles on this page. This one has five, and the three deep-dive
 * blocks become one sortable table with a lever attached to every row.
 * Closes VPC-FSR-013, and the density half of VPC-FSR-001.
 */
export default function PromotionsV2({
  ds, bench, venue, month, onModel,
}: {
  ds: Dataset; bench: Bench; venue: string; month: string
  onModel: (tag: string) => void
}) {
  const [sort, setSort] = useState<{ by: string; dir: 1 | -1 }>({ by: 'disc', dir: -1 })
  const prior = month === ALL ? null : prevMonth(ds, month)

  const all = bench.get(venue, ALL, month, 'all')
  const allP = prior ? bench.get(venue, ALL, prior, 'all') : null
  const imp = ds.promoImpacted.find(r => r.v === venue && r.m === month)
  const impP = prior ? ds.promoImpacted.find(r => r.v === venue && r.m === prior) : null

  const tags = useMemo(() => {
    const rows = ds.promoTag.filter(r => r.v === venue && r.m === month).map(t => {
      const p = prior ? ds.promoTag.find(x => x.v === venue && x.m === prior && x.t === t.t) : null
      const eff = t.impRev + t.disc ? t.disc / (t.impRev + t.disc) : NaN
      return { ...t, eff, reach: all.tx ? t.txs / all.tx : 0, d: delta(t.disc, p?.disc ?? NaN) }
    })
    const key = sort.by
    return rows.sort((a: any, b: any) => {
      if (key === 'tag') return a.t.localeCompare(b.t) * sort.dir * -1
      if (key === 'move') return ((isFinite(b.d.pct) ? b.d.pct : -Infinity) - (isFinite(a.d.pct) ? a.d.pct : -Infinity)) * (sort.dir === -1 ? 1 : -1)
      return ((b[key] ?? -Infinity) - (a[key] ?? -Infinity)) * (sort.dir === -1 ? 1 : -1)
    })
  }, [ds, venue, month, prior, sort, all.tx])

  const trend = useMemo(() => ds.months.map(m => {
    const row: any = { m: monthShort(m) }
    for (const c of PROMO_CATS) row[c] = ds.promoTag.filter(t => t.v === venue && t.m === m && t.c === c).reduce((a, r) => a + r.disc, 0)
    return row
  }), [ds, venue])

  const reachTrend = useMemo(() => ds.months.map(m => {
    const i = ds.promoImpacted.find(r => r.v === venue && r.m === m)
    const b = bench.get(venue, ALL, m, 'all')
    return { m: monthShort(m), rate: b.tx && i ? (i.txs / b.tx) * 100 : 0 }
  }), [ds, venue, bench])

  const gross = all.rev + all.disc
  const onSort = (id: string) => setSort(s => (s.by === id ? { by: id, dir: (s.dir * -1) as 1 | -1 } : { by: id, dir: -1 }))

  return (
    <>
      <Standfirst
        question="What is the discount buying us?"
        sub="Every row below is a mechanic you can switch off. The give is exact. What it bought is the part nobody has measured yet, so treat the effective rate as a cost, not a verdict."
      />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <JudgedKpi hero label="Given away" value={compact(all.disc)}
          delta={delta(all.disc, allP?.disc ?? NaN)}
          foot={<>{pct(gross ? all.disc / gross : 0, 2)} of gross sales</>} />
        <JudgedKpi label="Transactions touched" value={n0(imp?.txs ?? 0)}
          delta={delta(imp?.txs ?? NaN, impP?.txs ?? NaN)}
          foot={<>{pct(all.tx ? (imp?.txs ?? 0) / all.tx : 0, 1)} of all trade</>} />
        <JudgedKpi label="Revenue touched" value={compact(imp?.rev ?? 0)}
          delta={delta(imp?.rev ?? NaN, impP?.rev ?? NaN)} />
        <JudgedKpi label="Average give" value={'$' + n1(imp?.txs ? imp.disc / imp.txs : NaN)}
          foot={<>on <b>${n1(imp?.txs ? imp.rev / imp.txs : NaN)}</b> baskets</>} />
        <JudgedKpi label="Member share" value={pct(imp?.txs ? (imp.memTxs / imp.txs) : 0, 1)}
          foot="of discounted transactions" />
      </div>

      <Section title="Every mechanic, ranked" count={`${tags.length} tags · ${compact(tags.reduce((a, t) => a + t.disc, 0))} given`} open>
        <div className="tw flat">
          <table className="v2t">
            <thead>
              <tr className="head">
                <Sortable id="tag" sort={sort} onSort={onSort} className="l">Mechanic</Sortable>
                <th className="l">Category</th>
                <Sortable id="disc" sort={sort} onSort={onSort}>$ given</Sortable>
                <Sortable id="move" sort={sort} onSort={onSort}>vs prior month</Sortable>
                <Sortable id="eff" sort={sort} onSort={onSort}>Effective rate</Sortable>
                <Sortable id="reach" sort={sort} onSort={onSort}>Reach</Sortable>
                <Sortable id="txs" sort={sort} onSort={onSort}>TX touched</Sortable>
                <Sortable id="impRev" sort={sort} onSort={onSort}>Revenue on those TX</Sortable>
                <th />
              </tr>
            </thead>
            <tbody>
              {tags.map(t => (
                <tr key={t.t}>
                  <td className="l">{t.t}</td>
                  <td className="l"><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: CAT_COLOR[t.c], marginRight: 7 }} /><span className="muted">{t.c}</span></td>
                  <td className="num">{money(t.disc)}</td>
                  <td className="num"><DeltaTag d={t.d} abs={v => money(v)} /></td>
                  <td className="num">{pct(t.eff, 2)}</td>
                  <td className="num">{pct(t.reach, 1)}</td>
                  <td className="num">{n0(t.txs)}</td>
                  <td className="num">{money(t.impRev)}</td>
                  <td><button className="chip" onClick={() => onModel(t.t)}>Model this</button></td>
                </tr>
              ))}
              <tr className="total">
                <td className="l">Total, deduplicated</td><td />
                <td className="num">{money(imp?.disc ?? 0)}</td><td />
                <td className="num">{pct((imp?.rev ?? 0) + (imp?.disc ?? 0) ? (imp!.disc) / ((imp!.rev) + (imp!.disc)) : 0, 2)}</td>
                <td className="num">{pct(all.tx ? (imp?.txs ?? 0) / all.tx : 0, 1)}</td>
                <td className="num">{n0(imp?.txs ?? 0)}</td>
                <td className="num">{money(imp?.rev ?? 0)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
        <Caveat>
          A transaction touched by two mechanics counts in both rows, so the rows sum higher than the total.
          The total line uses a deduplicated transaction count, which is why it is smaller than the column above it.
          <b> $ given is exact at every level</b>, because one discount line carries exactly one tag.
        </Caveat>
      </Section>

      <Section title="Is the give growing?" count="by category, across the window" open>
        <div className="card-s">
          Two charts, not one with two axes. Dollars and reach are different units and putting them on
          one grid invents a crossing point that means nothing.
        </div>
        <div className="grid g2">
          <div>
            <div className="chart-t">Discount given each month, by category</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trend} margin={{ left: 6, right: 8 }}>
                <CartesianGrid {...grid} vertical={false} />
                <XAxis dataKey="m" {...axis} />
                <YAxis {...axis} domain={[0, 'auto']} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                <Tooltip content={<TT fmt={money} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
                {PROMO_CATS.map((c, i) => (
                  <Bar key={c} maxBarSize={46} dataKey={c} stackId="a" fill={CAT_COLOR[c]} radius={i === PROMO_CATS.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="chart-t">Share of transactions carrying any discount</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={reachTrend} margin={{ left: 6, right: 8 }}>
                <CartesianGrid {...grid} vertical={false} />
                <XAxis dataKey="m" {...axis} />
                <YAxis {...axis} unit="%" domain={[0, 'auto']} />
                <Tooltip content={<TT fmt={(v: number) => v.toFixed(1) + '%'} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Line type="monotone" dataKey="rate" name="% of TX discounted" stroke="var(--s3)" strokeWidth={2.2} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>
    </>
  )
}
