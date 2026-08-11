import React, { useMemo } from 'react'
import {
  ALL, Bench, Dataset, compact, delta, itemsPerTx, money, monthLabel, monthShort, n0, n1, n2, pct,
  perPerson, perTx, perVisit, prevMonth, venueCode, visPerPerson,
} from '../lib'
import { Section } from '../components/ui'
import { Caveat, DeltaTag, JudgedKpi, Standfirst } from '../components/v2ui'
import { Bar, BarChart, CartesianGrid, Cell as RCell, Legend, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: '#6E6890', fontSize: 11 }
const grid = { stroke: '#221F35' }
const COHORTS = ['1', '2-3', '4-10', '11+']
const LABEL: Record<string, string> = { '1': 'One visit', '2-3': 'Occasional', '4-10': 'Regular', '11+': 'Super-regular' }
const RAMP: Record<string, string> = { '1': '#4E477C', '2-3': '#6C51C2', '4-10': '#8168DC', '11+': '#A38DF4' }

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

export default function MembersV2({ ds, bench, month, venue }: { ds: Dataset; bench: Bench; month: string; venue: string }) {
  const prior = month === ALL ? null : prevMonth(ds, month)
  const mem = bench.get(venue, ALL, month, 'member')
  const non = bench.get(venue, ALL, month, 'nonmember')
  const memP = prior ? bench.get(venue, ALL, prior, 'member') : null

  const freq = useMemo(() => COHORTS.map(c =>
    ds.freq.find(f => f.venue === venue && f.month === month && f.cohort === c)
    || { venue, month, cohort: c, persons: 0, visits: 0, tx: 0, revenue: 0 }), [ds, venue, month])
  const tot = freq.reduce((a, f) => ({ p: a.p + f.persons, r: a.r + f.revenue, v: a.v + f.visits }), { p: 0, r: 0, v: 0 })

  const flow = useMemo(() => ds.months.map(m => {
    const f = ds.flow.find(x => x.venue === venue && x.month === m)
    return { m: monthShort(m), members: f?.persons || 0, new: f?.new || 0, returning: f?.returning || 0, vpp: f && f.persons ? f.visits / f.persons : 0 }
  }), [ds, venue])

  // Replaces the log-scale bar chart. Bars encode by length from zero, so a log
  // bar chart makes length meaningless. A dot plot on a linear scale keeps the
  // comparison honest and still copes with the range. Closes VPC-FSR-009.
  const spread = useMemo(() => [...ds.venuespread].sort((a, b) => a.venues - b.venues), [ds])
  const spreadTotal = spread.reduce((a, s) => a + s.members, 0)
  const spreadMax = Math.max(...spread.map(s => s.members))
  const multi = spreadTotal - (spread.find(s => s.venues === 1)?.members || 0)
  const pairs = useMemo(() => [...ds.pairs].sort((a, b) => b.n - a.n).slice(0, 10), [ds])

  const uplift = perPerson(non) ? perPerson(mem) / perPerson(non) : NaN

  return (
    <>
      <Standfirst
        question="Are members worth what we give them?"
        sub={`A member is worth ${isFinite(uplift) ? uplift.toFixed(1) + ' times' : 'more than'} a non-member per head. This page is about whether that gap is growing, and who is holding it up.`}
      />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <JudgedKpi hero label="Member value" value={'$' + n0(perPerson(mem))}
          delta={delta(perPerson(mem), memP ? perPerson(memP) : NaN)}
          foot={<>against <b>${n0(perPerson(non))}</b> for a non-member</>} />
        <JudgedKpi label="Active members" value={n0(mem.ppl)} delta={delta(mem.ppl, memP?.ppl ?? NaN)} />
        <JudgedKpi label="Member revenue" value={compact(mem.rev)} delta={delta(mem.rev, memP?.rev ?? NaN)}
          foot={<>{pct(mem.rev + non.rev ? mem.rev / (mem.rev + non.rev) : 0, 1)} of all revenue</>} />
        <JudgedKpi label="Visits per member" value={n2(visPerPerson(mem))} delta={delta(visPerPerson(mem), memP ? visPerPerson(memP) : NaN)}
          foot={<>against <b>{n2(visPerPerson(non))}</b> non-member</>} />
        <JudgedKpi label="Spend per visit" value={'$' + n1(perVisit(mem))} delta={delta(perVisit(mem), memP ? perVisit(memP) : NaN)} />
      </div>

      <Section title="Where the value concentrates" count={`${n0(tot.p)} members · ${compact(tot.r)}`} open>
        <div className="card-s">
          The gap between the two bars is the story: super-regulars are a tenth of the base and carry
          {' '}{pct(tot.r ? (freq.find(f => f.cohort === '11+')?.revenue || 0) / tot.r : 0, 0)} of member revenue.
          The ramp runs light to dark with visit frequency, so colour carries order rather than identity.
        </div>
        <div className="grid g2">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={freq.map(f => ({
              name: LABEL[f.cohort],
              members: tot.p ? (f.persons / tot.p) * 100 : 0,
              revenue: tot.r ? (f.revenue / tot.r) * 100 : 0,
            }))} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid {...grid} horizontal={false} />
              <XAxis type="number" {...axis} unit="%" domain={[0, 'auto']} />
              <YAxis type="category" dataKey="name" width={104} {...axis} />
              <Tooltip content={<TT fmt={(v: number) => v.toFixed(1) + '%'} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
              <Bar maxBarSize={20} dataKey="members" name="% of members" fill="#4A4470" radius={[0, 4, 4, 0]} />
              <Bar maxBarSize={20} dataKey="revenue" name="% of revenue" fill="var(--accent)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="tw flat">
            <table>
              <thead><tr className="head"><th className="l">Cohort</th><th>Members</th><th>Revenue</th><th>$ / member</th><th>Visits / member</th></tr></thead>
              <tbody>
                {freq.map(f => (
                  <tr key={f.cohort}>
                    <td className="l"><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: RAMP[f.cohort], marginRight: 8 }} />{LABEL[f.cohort]}</td>
                    <td className="num">{n0(f.persons)} <span className="muted">({pct(tot.p ? f.persons / tot.p : 0, 0)})</span></td>
                    <td className="num">{money(f.revenue)} <span className="muted">({pct(tot.r ? f.revenue / tot.r : 0, 0)})</span></td>
                    <td className="num">${n0(f.persons ? f.revenue / f.persons : NaN)}</td>
                    <td className="num">{n2(f.persons ? f.visits / f.persons : NaN)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="l">All members</td><td className="num">{n0(tot.p)}</td><td className="num">{money(tot.r)}</td>
                  <td className="num">${n0(tot.r / tot.p)}</td><td className="num">{n2(tot.v / tot.p)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Is the base growing or churning?" count={venue === ALL ? 'Feros Group' : venue} open>
        <div className="card-s">
          Two charts rather than one with two axes. Counts and ratios do not share a scale, and putting them on
          one grid makes the crossing point an artefact of the axes rather than a fact about the business.
        </div>
        <div className="grid g2">
          <div>
            <div className="chart-t">Members each month, split by whether they came back</div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={flow} margin={{ left: 4, right: 8 }}>
                <CartesianGrid {...grid} vertical={false} />
                <XAxis dataKey="m" {...axis} />
                <YAxis {...axis} domain={[0, 'auto']} tickFormatter={v => (v >= 1000 ? v / 1000 + 'k' : v)} />
                <Tooltip content={<TT />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
                <Bar maxBarSize={46} dataKey="returning" name="Returning" stackId="a" fill="var(--accent)" />
                <Bar maxBarSize={46} dataKey="new" name="New this month" stackId="a" fill="var(--s2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="chart-t">How often each member came, same months</div>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={flow} margin={{ left: 4, right: 8 }}>
                <CartesianGrid {...grid} vertical={false} />
                <XAxis dataKey="m" {...axis} />
                <YAxis {...axis} domain={[0, 'auto']} />
                <Tooltip content={<TT fmt={(v: number) => n2(v)} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Line type="monotone" dataKey="vpp" name="Visits per member" stroke="var(--s3)" strokeWidth={2.2} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section title="How much of the base is shared between venues?" count={`${n0(multi)} of ${n0(spreadTotal)} members visit more than one`}>
        <div className="card-s">
          A dot plot on a linear scale, not bars. The single-venue group is more than twice everything else combined,
          and a bar chart would either flatten that or need a log scale, which makes bar length meaningless.
        </div>
        <div className="grid g2">
          <div className="dotplot">
            {spread.map(s => (
              <div className="dotrow" key={s.venues}>
                <span className="dotlab">{s.venues === 1 ? '1 venue' : `${s.venues} venues`}</span>
                <div className="dottrack">
                  <i className="dotline" style={{ width: (s.members / spreadMax) * 100 + '%' }} />
                  <i className="dotmark" style={{ left: (s.members / spreadMax) * 100 + '%', background: s.venues === 1 ? '#4A4470' : 'var(--accent)' }} />
                </div>
                <span className="dotval num">{n0(s.members)}</span>
              </div>
            ))}
          </div>
          <div className="tw" style={{ maxHeight: 320 }}>
            <table>
              <thead><tr className="head"><th className="l">Venue pair</th><th>Shared members</th></tr></thead>
              <tbody>
                {pairs.map(p => (
                  <tr key={p.a + p.b}>
                    <td className="l"><span className="tag">{venueCode(ds, p.a)}</span> ∩ <span className="tag">{venueCode(ds, p.b)}</span> {p.a} · {p.b}</td>
                    <td className="num">{n0(p.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Caveat>
          Cross-venue overlap is a property of the whole seven-month window, so it does not change when you
          switch month. Everything else on this page does.
        </Caveat>
      </Section>
    </>
  )
}
