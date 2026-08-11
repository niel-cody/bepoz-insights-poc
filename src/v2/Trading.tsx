import React, { useMemo, useState } from 'react'
import { ALL, DOW, Dataset, compact, delta, heatCells, money, n0, n1, n2, pct } from '../lib'
import { Section } from '../components/ui'
import { Caveat, DeltaTag, JudgedKpi, Standfirst } from '../components/v2ui'
import { Bar, BarChart, CartesianGrid, Cell as RCell, Legend, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: '#6E6890', fontSize: 11 }
const grid = { stroke: '#221F35' }
const DP = [
  { k: 'Lunch', label: 'Lunch', hint: 'before 15:00' },
  { k: 'Happy', label: 'Happy hour', hint: '15:00 to 17:59' },
  { k: 'Dinner', label: 'Dinner', hint: 'from 18:00' },
]
const PATTERNS = [
  { k: 'L', label: 'Lunch only', cross: false }, { k: 'H', label: 'Happy only', cross: false },
  { k: 'D', label: 'Dinner only', cross: false }, { k: 'LH', label: 'Lunch then Happy', cross: true },
  { k: 'HD', label: 'Happy then Dinner', cross: true }, { k: 'LD', label: 'Lunch and Dinner', cross: true },
  { k: 'LHD', label: 'All three', cross: true },
]

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

const RAMP = ['#171525', '#241E42', '#33265E', '#452F7E', '#5A3CA0', '#7350C4', '#8B6FE8', '#A992F2']
const rampColor = (t: number) => {
  if (!isFinite(t) || t <= 0) return RAMP[0]
  const s = Math.sqrt(Math.min(1, t))
  return RAMP[Math.min(RAMP.length - 1, Math.max(1, Math.ceil(s * (RAMP.length - 1))))]
}

function Heatmap({ ds, venue, month }: { ds: Dataset; venue: string; month: string }) {
  const cells = useMemo(() => heatCells(ds, venue, month), [ds, venue, month])
  const hol = useMemo(() => new Set(ds.hol.map(h => h.d)), [ds])
  const hours = useMemo(() => {
    const hs = new Set<number>()
    for (const c of cells) if (c.tx > 0) hs.add(c.h)
    const l = [...hs].sort((a, b) => a - b)
    return [...l.filter(h => h >= 6), ...l.filter(h => h < 6)]
  }, [cells])
  const map = useMemo(() => new Map(cells.map(c => [c.d * 100 + c.h, c])), [cells])
  const max = useMemo(() => Math.max(1, ...cells.map(c => c.rev)), [cells])
  const peak = useMemo(() => cells.reduce((a, c) => (c.rev > (a?.rev ?? -1) ? c : a), null as any), [cells])
  const [hover, setHover] = useState<{ d: number; h: number; x: number; y: number } | null>(null)
  const [showTable, setShowTable] = useState(false)

  const CW = 34, CH = 26, LEFT = 44, TOP = 34
  const W = LEFT + hours.length * CW + 8, H = TOP + 7 * CH + 6

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {hours.map((h, i) => (
            <text key={h} x={LEFT + i * CW + CW / 2} y={TOP - 9} textAnchor="middle" fontSize={9.5} fill="#6E6890">
              {h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : h - 12 + 'p'}
            </text>
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map(d => (
            <text key={d} x={LEFT - 10} y={TOP + d * CH + CH / 2 + 3.5} textAnchor="end" fontSize={10.5} fill="#A29CBF">{DOW[d]}</text>
          ))}
          {[15, 18].map(bh => {
            const i = hours.indexOf(bh)
            return i < 0 ? null : <line key={bh} x1={LEFT + i * CW} y1={TOP - 4} x2={LEFT + i * CW} y2={TOP + 7 * CH} stroke="#463C6E" strokeDasharray="3 3" />
          })}
          {[0, 1, 2, 3, 4, 5, 6].map(d => hours.map((h, i) => {
            const c = map.get((d + 1) * 100 + h)
            return (
              <rect key={d + '-' + h} x={LEFT + i * CW + 1} y={TOP + d * CH + 1} width={CW - 2} height={CH - 2} rx={3}
                fill={rampColor(c ? c.rev / max : 0)}
                stroke={hover && hover.d === d && hover.h === h ? '#EDEAF7' : 'transparent'}
                onMouseEnter={() => setHover({ d, h, x: LEFT + i * CW, y: TOP + d * CH })}
                onMouseLeave={() => setHover(null)} />
            )
          }))}
        </svg>
      </div>
      {hover && (() => {
        const c = map.get((hover.d + 1) * 100 + hover.h)
        return (
          <div className="tt" style={{ position: 'absolute', left: Math.min(hover.x, 620), top: hover.y + 30, pointerEvents: 'none', zIndex: 5 }}>
            <div style={{ fontWeight: 620, marginBottom: 4 }}>{DOW[hover.d]} · {hover.h}:00</div>
            <div className="num">{money(c?.rev || 0)} · {n0(c?.tx || 0)} TX</div>
          </div>
        )
      })()}
      <div className="legend">
        <span>Quiet</span>
        {RAMP.map((c, i) => <i key={i} style={{ background: c, width: 22, height: 10, borderRadius: 2, marginRight: 0, border: '1px solid #2A2640' }} />)}
        <span>Busy</span>
        {peak && <span style={{ color: 'var(--accent)' }}>Peak {DOW[peak.d - 1]} {peak.h}:00, {money(peak.rev)}</span>}
        <span style={{ marginLeft: 'auto' }}>
          <button className="chip" onClick={() => setShowTable(v => !v)}>{showTable ? 'Hide' : 'Show'} as numbers</button>
        </span>
      </div>
      {showTable && (
        <div className="tw" style={{ maxHeight: 320, marginTop: 10 }}>
          <table>
            <thead><tr className="head"><th className="l">Day</th>{hours.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5, 6].map(d => (
                <tr key={d}>
                  <td className="l">{DOW[d]}</td>
                  {hours.map(h => <td key={h} className="num">{compact(map.get((d + 1) * 100 + h)?.rev || 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function TradingV2({ ds, bench, venue, month }: { ds: Dataset; bench: any; venue: string; month: string }) {
  const dps = useMemo(() => DP.map(d => ds.daypart.find(r => r.v === venue && r.m === month && r.k === d.k)
    || { v: venue, m: month, k: d.k, tx: 0, rev: 0, vis: 0, items: 0, food: 0, bev: 0 }), [ds, venue, month])
  const dpTot = dps.reduce((a, d) => ({ tx: a.tx + d.tx, rev: a.rev + d.rev, items: a.items + d.items }), { tx: 0, rev: 0, items: 0 })

  const dow = useMemo(() => DOW.map((label, i) => {
    const r = ds.dow.find(x => x.v === venue && x.m === month && x.k === i + 1)
    return { day: label, rev: r?.rev || 0, tx: r?.tx || 0, atv: r?.tx ? r.rev / r.tx : 0, pv: r?.vis ? r.rev / r.vis : 0 }
  }), [ds, venue, month])

  const cross = useMemo(() => PATTERNS.map(p => {
    const r = ds.crossover.find(x => x.v === venue && x.m === month && x.p === p.k)
    return { ...p, visits: r?.visits || 0, rev: r?.rev || 0, tx: r?.tx || 0, mem: r?.mem || 0 }
  }), [ds, venue, month])
  const crossTot = cross.reduce((a, c) => ({ visits: a.visits + c.visits, rev: a.rev + c.rev }), { visits: 0, rev: 0 })
  const crossOnly = cross.filter(c => c.cross).reduce((a, c) => ({ visits: a.visits + c.visits, rev: a.rev + c.rev }), { visits: 0, rev: 0 })
  const crossValue = crossOnly.visits ? crossOnly.rev / crossOnly.visits : NaN
  const singleValue = (crossTot.visits - crossOnly.visits) ? (crossTot.rev - crossOnly.rev) / (crossTot.visits - crossOnly.visits) : NaN

  const peakDay = dow.reduce((a, d) => (d.rev > a.rev ? d : a), dow[0])
  const quietDay = dow.filter(d => d.rev > 0).reduce((a, d) => (d.rev < a.rev ? d : a), dow.find(d => d.rev > 0) || dow[0])

  return (
    <>
      <Standfirst
        question="When does this venue actually make its money?"
        sub={`${peakDay.day} is the biggest day and ${quietDay.day} the quietest. The heatmap below is where the shifts you can actually change show up.`}
      />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <JudgedKpi hero label="Busiest day" value={peakDay.day}
          delta={delta(peakDay.rev, quietDay.rev)} deltaLabel={`vs ${quietDay.day}`}
          foot={<>{compact(peakDay.rev)} against {compact(quietDay.rev)}</>} />
        {dps.map((d, i) => (
          <JudgedKpi key={d.k} label={DP[i].label} value={compact(d.rev)}
            delta={delta(d.rev, dpTot.rev / 3)} deltaLabel="vs an even split"
            foot={<>{DP[i].hint} · {pct(dpTot.rev ? d.rev / dpTot.rev : 0, 0)} of trade · ${n1(d.tx ? d.rev / d.tx : NaN)} per TX</>} />
        ))}
        <JudgedKpi label="Visits that cross a daypart" value={pct(crossTot.visits ? crossOnly.visits / crossTot.visits : 0, 1)}
          delta={isFinite(crossValue) && isFinite(singleValue) ? delta(crossValue, singleValue) : undefined}
          deltaLabel="worth vs a single-band visit" />
      </div>

      <Section title="Which day of the week works hardest?" count={`peak ${peakDay.day}`} open>
        <div className="card-s">
          Volume and value are separate charts on purpose. They use different units, and a shared grid would
          invent a crossing point that says nothing about the business.
        </div>
        <div className="grid g2">
          <div>
            <div className="chart-t">Revenue by day of week</div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={dow} margin={{ left: 6, right: 8 }}>
                <CartesianGrid {...grid} vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} domain={[0, 'auto']} tickFormatter={v => '$' + (v / 1e6).toFixed(1) + 'm'} />
                <Tooltip content={<TT fmt={money} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Bar maxBarSize={54} dataKey="rev" name="Revenue" radius={[4, 4, 0, 0]}>
                  {dow.map((d, i) => <RCell key={i} fill={d.day === peakDay.day ? 'var(--accent)' : '#4A4470'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-note">One accent, the rest recessive: the story here is which day wins, not seven equal categories.</div>
          </div>
          <div>
            <div className="chart-t">What a transaction and a visit are worth, same days</div>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={dow} margin={{ left: 6, right: 8 }}>
                <CartesianGrid {...grid} vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} domain={[0, 'auto']} tickFormatter={v => '$' + v.toFixed(0)} />
                <Tooltip content={<TT fmt={(v: number) => '$' + v.toFixed(2)} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
                <Line type="monotone" dataKey="atv" name="$ per transaction" stroke="var(--s3)" strokeWidth={2.2} dot={{ r: 2.5 }} />
                <Line type="monotone" dataKey="pv" name="$ per visit" stroke="var(--s2)" strokeWidth={2.2} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section title="Which hours are worth staffing?" count="day by hour, 4am trade-day boundary" open>
        <div className="card-s">
          Revenue by trade-day and clock hour. A transaction rung at 1am Tuesday belongs to <b>Monday</b>'s row,
          because Monday night's service ran late. The grid is drawn 6am to 5am so a night of trade reads left to right.
        </div>
        <Heatmap ds={ds} venue={venue} month={month} />
      </Section>

      <Section title="Do guests stay across dayparts?" count={`${pct(crossTot.visits ? crossOnly.visits / crossTot.visits : 0, 1)} of visits do`} open>
        <div className="card-s">
          A visit that crosses a daypart is worth {isFinite(crossValue) && isFinite(singleValue) ? <b>{(crossValue / singleValue).toFixed(1)} times</b> : 'more than'} one
          that does not. Crossing patterns are marked and labelled, not just coloured.
        </div>
        <div className="grid g2">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={cross.map(c => ({ name: (c.cross ? '↔ ' : '') + c.label, visits: c.visits, cross: c.cross }))}
              layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid {...grid} horizontal={false} />
              <XAxis type="number" {...axis} domain={[0, 'auto']} tickFormatter={v => (v >= 1000 ? v / 1000 + 'k' : v)} />
              <YAxis type="category" dataKey="name" width={140} {...axis} />
              <Tooltip content={<TT />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
              <Legend payload={[
                { value: 'Crosses a daypart', type: 'square', color: 'var(--accent)' },
                { value: 'Stays in one', type: 'square', color: '#4A4470' },
              ]} wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
              <Bar maxBarSize={20} dataKey="visits" name="Visits" radius={[0, 4, 4, 0]}>
                {cross.map((c, i) => <RCell key={i} fill={c.cross ? 'var(--accent)' : '#4A4470'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="tw flat">
            <table>
              <thead><tr className="head"><th className="l">Pattern</th><th>Visits</th><th>$ / visit</th><th>% member</th></tr></thead>
              <tbody>
                {cross.map(c => (
                  <tr key={c.k}>
                    <td className="l">{c.cross && <span style={{ color: 'var(--accent)', marginRight: 6 }}>↔</span>}{c.label}</td>
                    <td className="num">{n0(c.visits)}</td>
                    <td className="num" style={{ color: c.cross ? 'var(--pos)' : undefined }}>${n1(c.visits ? c.rev / c.visits : NaN)}</td>
                    <td className="num">{pct(c.visits ? c.mem / c.visits : 0, 0)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="l">All visits</td><td className="num">{n0(crossTot.visits)}</td>
                  <td className="num">${n1(crossTot.rev / crossTot.visits)}</td><td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <Caveat>
          Daypart visits do not sum to the total: a visit spanning lunch and dinner is counted once in each band.
          The figures above are deduplicated at visit level, which is why they are lower than adding the three daypart tiles.
        </Caveat>
      </Section>
    </>
  )
}
