import React, { useMemo, useState } from 'react'
import {
  ALL, Bench, Dataset, compact, itemsPerTx, money, monthLabel, monthShort, n0, n1, n2, pct,
  perPerson, perTx, perVisit, txPerVisit, venueCode, visPerPerson,
} from '../lib'
import { Card, Kpi, Note, Section, Seg } from '../components/ui'
import {
  Bar, BarChart, CartesianGrid, Cell as RCell, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'

const COHORTS = ['1', '2-3', '4-10', '11+']
const COHORT_LABEL: Record<string, string> = { '1': 'One visit', '2-3': 'Occasional (2–3)', '4-10': 'Regular (4–10)', '11+': 'Super-regular (11+)' }
const COHORT_COLOR: Record<string, string> = { '1': '#4A4470', '2-3': 'var(--s5)', '4-10': 'var(--s2)', '11+': 'var(--s1)' }

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

export default function Members({ ds, bench, month, venue }: { ds: Dataset; bench: Bench; month: string; venue: string }) {
  const mem = bench.get(venue, ALL, month, 'member')
  const non = bench.get(venue, ALL, month, 'nonmember')
  const all = bench.get(venue, ALL, month, 'all')

  const freq = useMemo(
    () => COHORTS.map(c => ds.freq.find(f => f.venue === venue && f.month === month && f.cohort === c)
      || { venue, month, cohort: c, persons: 0, visits: 0, tx: 0, revenue: 0 }),
    [ds, venue, month]
  )
  const freqTot = freq.reduce((a, f) => ({ persons: a.persons + f.persons, visits: a.visits + f.visits, tx: a.tx + f.tx, revenue: a.revenue + f.revenue }), { persons: 0, visits: 0, tx: 0, revenue: 0 })

  const flow = useMemo(() => ds.months.map(m => {
    const f = ds.flow.find(x => x.venue === venue && x.month === m)
    const prev = ds.flow.find(x => x.venue === venue && x.month === ds.months[ds.months.indexOf(m) - 1])
    const lapsed = prev ? Math.max(0, prev.persons - (f?.returning || 0)) : 0
    return {
      m: monthShort(m), persons: f?.persons || 0, visits: f?.visits || 0, revenue: f?.revenue || 0,
      new: f?.new || 0, returning: f?.returning || 0, lapsed,
      vpp: f && f.persons ? f.visits / f.persons : 0,
    }
  }), [ds, venue])

  const ret = useMemo(() => {
    const base = ds.retention.find(r => r.venue === venue)?.base || 0
    return ds.months.map(m => {
      const r = ds.retention.find(x => x.venue === venue && x.month === m)
      return { m: monthShort(m), retained: r?.retained || 0, rate: base ? (r?.retained || 0) / base : 0 }
    })
  }, [ds, venue])

  const spread = useMemo(() => [...ds.venuespread].sort((a, b) => a.venues - b.venues), [ds])
  const spreadTotal = spread.reduce((a, s) => a + s.members, 0)
  const topPairs = useMemo(() => [...ds.pairs].sort((a, b) => b.n - a.n).slice(0, 12), [ds])

  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Members" value={n0(mem.ppl)} detail={<>{pct(all.ppl ? mem.ppl / all.ppl : 0, 1)} <b>of all people counted</b></>} />
        <Kpi label="Member revenue" value={compact(mem.rev)} detail={<>{pct(all.rev ? mem.rev / all.rev : 0, 1)} <b>of venue revenue</b></>} />
        <Kpi label="$ / member" value={'$' + n0(perPerson(mem))} detail={<>vs <b>${n0(perPerson(non))}</b> non-member</>} />
        <Kpi label="Visits / member" value={n2(visPerPerson(mem))} detail={<>vs <b>{n2(visPerPerson(non))}</b> non-member</>} />
        <Kpi label="$ / visit" value={'$' + n1(perVisit(mem))} detail={<>vs <b>${n1(perVisit(non))}</b> non-member</>} />
        <Kpi label="TX / visit" value={n2(txPerVisit(mem))} detail={<>ATV <b>${n1(perTx(mem))}</b></>} />
        <Kpi label="Items / TX" value={n2(itemsPerTx(mem))} detail={<>vs <b>{n2(itemsPerTx(non))}</b> non-member</>} />
        <Kpi label="Member uplift" value={perPerson(non) ? (perPerson(mem) / perPerson(non)).toFixed(1) + '×' : '—'} detail={<>value per person</>} />
      </div>

      <Section title="Frequency cohorts" count={`${n0(freqTot.persons)} members · ${compact(freqTot.revenue)}`} open>
        <div className="grid g2">
          <div className="tw flat">
            <table>
              <thead>
                <tr className="head">
                  <th className="l">Cohort</th><th>Members</th><th>% members</th><th>Visits</th>
                  <th>TX</th><th>Revenue</th><th>% revenue</th><th>Visits / member</th><th>$ / visit</th><th>$ / member</th>
                </tr>
              </thead>
              <tbody>
                {freq.map(f => (
                  <tr key={f.cohort}>
                    <td className="l"><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: COHORT_COLOR[f.cohort], marginRight: 8 }} />{COHORT_LABEL[f.cohort]}</td>
                    <td className="num">{n0(f.persons)}</td>
                    <td className="num">{pct(freqTot.persons ? f.persons / freqTot.persons : 0)}</td>
                    <td className="num">{n0(f.visits)}</td>
                    <td className="num">{n0(f.tx)}</td>
                    <td className="num">{money(f.revenue)}</td>
                    <td className="num">{pct(freqTot.revenue ? f.revenue / freqTot.revenue : 0)}</td>
                    <td className="num">{n2(f.persons ? f.visits / f.persons : NaN)}</td>
                    <td className="num">${n1(f.visits ? f.revenue / f.visits : NaN)}</td>
                    <td className="num">${n0(f.persons ? f.revenue / f.persons : NaN)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="l">All members</td>
                  <td className="num">{n0(freqTot.persons)}</td><td className="num">100%</td>
                  <td className="num">{n0(freqTot.visits)}</td><td className="num">{n0(freqTot.tx)}</td>
                  <td className="num">{money(freqTot.revenue)}</td><td className="num">100%</td>
                  <td className="num">{n2(freqTot.visits / freqTot.persons)}</td>
                  <td className="num">${n1(freqTot.revenue / freqTot.visits)}</td>
                  <td className="num">${n0(freqTot.revenue / freqTot.persons)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="card-s">Share of members vs share of revenue. The gap between the two bars is the concentration story.</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={freq.map(f => ({
                name: COHORT_LABEL[f.cohort], members: freqTot.persons ? (f.persons / freqTot.persons) * 100 : 0,
                revenue: freqTot.revenue ? (f.revenue / freqTot.revenue) * 100 : 0,
              }))} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid {...grid} horizontal={false} />
                <XAxis type="number" {...axis} unit="%" />
                <YAxis type="category" dataKey="name" width={124} {...axis} />
                <Tooltip content={<TT fmt={(v: number) => v.toFixed(1) + '%'} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
                <Bar maxBarSize={64} dataKey="members" name="% of members" fill="#4A4470" radius={[0, 4, 4, 0]} />
                <Bar maxBarSize={64} dataKey="revenue" name="% of revenue" fill="var(--s1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section title="Monthly flow" count={`${venue === ALL ? 'Feros Group' : venue}`} open>
        <div className="grid g2">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={flow} margin={{ left: 4, right: 8 }}>
              <CartesianGrid {...grid} vertical={false} />
              <XAxis dataKey="m" {...axis} />
              <YAxis {...axis} tickFormatter={v => (v >= 1000 ? v / 1000 + 'k' : v)} />
              <YAxis yAxisId="r" orientation="right" {...axis} domain={[0, 'auto']} />
              <Tooltip content={<TT />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
              <Bar maxBarSize={64} dataKey="returning" name="Returning" stackId="a" fill="var(--s1)" radius={[0, 0, 0, 0]} />
              <Bar maxBarSize={64} dataKey="new" name="New this month" stackId="a" fill="var(--s2)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="vpp" name="Visits / member" stroke="var(--s3)" strokeWidth={2} dot={{ r: 2.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="tw flat">
            <table>
              <thead><tr className="head"><th className="l">Month</th><th>Members</th><th>New</th><th>Returning</th><th>Lapsed</th><th>Visits</th><th>Visits / member</th><th>Revenue</th></tr></thead>
              <tbody>
                {flow.map(f => (
                  <tr key={f.m}>
                    <td className="l">{f.m}</td>
                    <td className="num">{n0(f.persons)}</td>
                    <td className="num" style={{ color: 'var(--s2)' }}>{f.new ? '+' + n0(f.new) : '—'}</td>
                    <td className="num">{n0(f.returning)}</td>
                    <td className="num" style={{ color: f.lapsed ? 'var(--neg)' : undefined }}>{f.lapsed ? '−' + n0(f.lapsed) : '—'}</td>
                    <td className="num">{n0(f.visits)}</td>
                    <td className="num">{n2(f.vpp)}</td>
                    <td className="num">{money(f.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Retention — January cohort tracked forward" count={`base ${n0(ds.retention.find(r => r.venue === venue)?.base || 0)} members`}>
        <div className="grid g2">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ret} margin={{ left: 4, right: 8 }}>
              <CartesianGrid {...grid} vertical={false} />
              <XAxis dataKey="m" {...axis} />
              <YAxis {...axis} tickFormatter={v => (v >= 1000 ? v / 1000 + 'k' : v)} />
              <Tooltip content={<TT />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
              <Bar maxBarSize={64} dataKey="retained" name="Still active" radius={[4, 4, 0, 0]}>
                {ret.map((r, i) => <RCell key={i} fill={i === 0 ? 'var(--s2)' : 'var(--s1)'} fillOpacity={i === 0 ? 1 : 0.55 + 0.45 * r.rate} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="tw flat">
            <table>
              <thead><tr className="head"><th className="l">Month</th><th>Retained</th><th>Retention rate</th><th /></tr></thead>
              <tbody>
                {ret.map(r => (
                  <tr key={r.m}>
                    <td className="l">{r.m}</td>
                    <td className="num">{n0(r.retained)}</td>
                    <td className="num">{pct(r.rate)}</td>
                    <td style={{ width: 150 }}><div className="bar"><i style={{ width: (r.rate * 100).toFixed(1) + '%' }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Cross-venue members" count={`${n0(spreadTotal - (spread[0]?.members || 0))} members visit more than one venue`}>
        <div className="grid g2">
          <div>
            <div className="card-s">How many of the group's {n0(spreadTotal)} members are shared across venues. Single-venue members are the base; everything above is group value the venues create for each other.</div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={spread.map(s => ({ name: s.venues === 1 ? '1 venue' : s.venues + ' venues', members: s.members }))} margin={{ left: 4, right: 8 }}>
                <CartesianGrid {...grid} vertical={false} />
                <XAxis dataKey="name" {...axis} />
                <YAxis {...axis} scale="log" domain={[1, 'auto']} tickFormatter={v => (v >= 1000 ? v / 1000 + 'k' : v)} />
                <Tooltip content={<TT />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Bar maxBarSize={64} dataKey="members" name="Members" radius={[4, 4, 0, 0]}>
                  {spread.map((s, i) => <RCell key={i} fill={s.venues === 1 ? '#4A4470' : 'var(--s1)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="card-s" style={{ marginTop: 6 }}>Log scale — the single-venue bar dwarfs the rest.</div>
          </div>
          <div className="tw" style={{ maxHeight: 340 }}>
            <table>
              <thead><tr className="head"><th className="l">Venue pair</th><th>Shared members</th><th /></tr></thead>
              <tbody>
                {topPairs.map(p => (
                  <tr key={p.a + p.b}>
                    <td className="l"><span className="tag">{venueCode(ds, p.a)}</span> <span style={{ color: 'var(--text-3)' }}>∩</span> <span className="tag">{venueCode(ds, p.b)}</span>&nbsp; {p.a} · {p.b}</td>
                    <td className="num">{n0(p.n)}</td>
                    <td style={{ width: 120 }}><div className="bar"><i style={{ width: ((p.n / topPairs[0].n) * 100).toFixed(1) + '%' }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Note>
        <ul>
          <li><b>Member</b> = an order carrying an Oolio One loyalty customer ID. {pct(0.677, 1)} of the group's completed orders are member-identified, which is what makes cohort analysis viable at this scale.</li>
          <li><b>Frequency cohorts</b> bucket each member by <b>distinct visit days</b> within the selected scope — so cohorts recompute when you change month or venue, exactly as in the original review.</li>
          <li><b>New</b> = first month this member appears at this venue in the window. <b>Returning</b> = also present in the immediately prior month. <b>Lapsed</b> = prior-month members absent this month.</li>
          <li><b>Retention</b> tracks the January member cohort forward. It is not a rolling cohort — the base is fixed.</li>
          <li>Cross-venue counts are computed on the whole seven-month window and do not change with the month filter, because overlap is a property of the period.</li>
        </ul>
      </Note>
    </>
  )
}
