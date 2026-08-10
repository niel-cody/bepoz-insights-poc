import React, { useMemo, useState } from 'react'
import { ALL, DOW, Dataset, compact, heatCells, itemsPerTx, money, n0, n1, n2, pct } from '../lib'
import { Kpi, Note, Section } from '../components/ui'
import { Bar, BarChart, CartesianGrid, Cell as RCell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: '#6E6890', fontSize: 11 }
const grid = { stroke: '#221F35' }
const DP = [
  { k: 'Lunch', label: 'Lunch', hint: 'before 15:00', icon: '☀' },
  { k: 'Happy', label: 'Happy hour', hint: '15:00 – 17:59', icon: '🍻' },
  { k: 'Dinner', label: 'Dinner', hint: '18:00 onwards', icon: '🌆' },
]
const PATTERNS = [
  { k: 'L', label: 'Lunch only', cross: false }, { k: 'H', label: 'Happy only', cross: false },
  { k: 'D', label: 'Dinner only', cross: false }, { k: 'LH', label: 'Lunch → Happy', cross: true },
  { k: 'HD', label: 'Happy → Dinner', cross: true }, { k: 'LD', label: 'Lunch + Dinner', cross: true },
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

// Sequential ramp: deep surface -> violet. Perceptually monotonic in lightness.
const RAMP = ['#171525', '#241E42', '#33265E', '#452F7E', '#5A3CA0', '#7350C4', '#8B6FE8', '#A992F2']
// Revenue across day x hour is heavily right-skewed (a Saturday 6pm cell is
// ~200x a Tuesday 8am cell). A linear ramp collapses everything but the peak
// into the darkest bin, so bin on sqrt(t) to keep the mid-range legible.
function rampColor(t: number) {
  if (!isFinite(t) || t <= 0) return RAMP[0]
  const s = Math.sqrt(Math.min(1, t))
  const i = Math.min(RAMP.length - 1, Math.max(1, Math.ceil(s * (RAMP.length - 1))))
  return RAMP[i]
}

function Heatmap({ ds, venue, month }: { ds: Dataset; venue: string; month: string }) {
  const cells = useMemo(() => heatCells(ds, venue, month), [ds, venue, month])
  const hours = useMemo(() => {
    const hs = new Set<number>()
    for (const c of cells) if (c.tx > 0) hs.add(c.h)
    const list = [...hs].sort((a, b) => a - b)
    // Render as a trade-day axis: 6am .. 5am next day.
    const ordered = [...list.filter(h => h >= 6), ...list.filter(h => h < 6)]
    return ordered
  }, [cells])
  const map = useMemo(() => {
    const m = new Map<number, { tx: number; rev: number }>()
    for (const c of cells) m.set(c.d * 100 + c.h, { tx: c.tx, rev: c.rev })
    return m
  }, [cells])
  const max = useMemo(() => Math.max(1, ...cells.map(c => c.rev)), [cells])
  const peak = useMemo(() => cells.reduce((a, c) => (c.rev > (a?.rev ?? -1) ? c : a), null as any), [cells])
  const [hover, setHover] = useState<{ d: number; h: number; x: number; y: number } | null>(null)

  const CW = 34, CH = 26, LEFT = 44, TOP = 34
  const W = LEFT + hours.length * CW + 8
  const H = TOP + 7 * CH + 6

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {hours.map((h, i) => (
            <text key={'h' + h} x={LEFT + i * CW + CW / 2} y={TOP - 9} textAnchor="middle" fontSize={9.5} fill="#6E6890">
              {h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : h - 12 + 'p'}
            </text>
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map(d => (
            <text key={'d' + d} x={LEFT - 10} y={TOP + d * CH + CH / 2 + 3.5} textAnchor="end" fontSize={10.5} fill="#A29CBF">{DOW[d]}</text>
          ))}
          {/* daypart dividers */}
          {[15, 18].map(bh => {
            const i = hours.indexOf(bh)
            if (i < 0) return null
            return <line key={bh} x1={LEFT + i * CW} y1={TOP - 4} x2={LEFT + i * CW} y2={TOP + 7 * CH} stroke="#463C6E" strokeDasharray="3 3" />
          })}
          {[0, 1, 2, 3, 4, 5, 6].map(d => hours.map((h, i) => {
            const c = map.get((d + 1) * 100 + h)
            const t = c ? c.rev / max : 0
            return (
              <rect
                key={d + '-' + h} x={LEFT + i * CW + 1} y={TOP + d * CH + 1} width={CW - 2} height={CH - 2} rx={3}
                fill={rampColor(t)} stroke={hover && hover.d === d && hover.h === h ? '#EDEAF7' : 'transparent'}
                onMouseEnter={() => setHover({ d, h, x: LEFT + i * CW, y: TOP + d * CH })}
                onMouseLeave={() => setHover(null)}
              />
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
        <span>Revenue intensity</span>
        {RAMP.map((c, i) => <i key={i} style={{ background: c, width: 22, height: 10, borderRadius: 2, marginRight: 0, border: '1px solid #2A2640' }} />)}
        <span>low → high</span>
        {peak && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>Peak: {DOW[peak.d - 1]} {peak.h}:00 — {money(peak.rev)}</span>}
      </div>
    </div>
  )
}

export default function Trading({ ds, venue, month }: { ds: Dataset; venue: string; month: string }) {
  const dps = useMemo(() => DP.map(d => ds.daypart.find(r => r.v === venue && r.m === month && r.k === d.k)
    || { v: venue, m: month, k: d.k, tx: 0, rev: 0, vis: 0, items: 0, food: 0, bev: 0 }), [ds, venue, month])
  const dpTot = dps.reduce((a, d) => ({ tx: a.tx + d.tx, rev: a.rev + d.rev, vis: a.vis + d.vis, items: a.items + d.items, food: a.food + d.food, bev: a.bev + d.bev }), { tx: 0, rev: 0, vis: 0, items: 0, food: 0, bev: 0 })

  const dow = useMemo(() => DOW.map((label, i) => {
    const r = ds.dow.find(x => x.v === venue && x.m === month && x.k === i + 1)
    return { day: label, rev: r?.rev || 0, tx: r?.tx || 0, vis: r?.vis || 0, atv: r?.tx ? r.rev / r.tx : 0, perVisit: r?.vis ? r.rev / r.vis : 0 }
  }), [ds, venue, month])

  const hourly = useMemo(() => {
    const rows = ds.hourly.filter(r => r.v === venue && r.m === month).sort((a, b) => a.k - b.k)
    const ordered = [...rows.filter(r => r.k >= 6), ...rows.filter(r => r.k < 6)]
    return ordered.map(r => ({ hour: r.k === 0 ? '12a' : r.k < 12 ? r.k + 'a' : r.k === 12 ? '12p' : r.k - 12 + 'p', rev: r.rev, tx: r.tx, atv: r.tx ? r.rev / r.tx : 0 }))
  }, [ds, venue, month])

  // Summing visits across dayparts over-counts: one visit can span two or three
  // bands. The true visit count for this scope is the crossover pattern total.
  const trueVisits = useMemo(
    () => ds.crossover.filter(r => r.v === venue && r.m === month).reduce((a, r) => a + r.visits, 0),
    [ds, venue, month]
  )

  const cross = useMemo(() => PATTERNS.map(p => {
    const r = ds.crossover.find(x => x.v === venue && x.m === month && x.p === p.k)
    return { ...p, visits: r?.visits || 0, rev: r?.rev || 0, tx: r?.tx || 0, mem: r?.mem || 0 }
  }), [ds, venue, month])
  const crossTot = cross.reduce((a, c) => ({ visits: a.visits + c.visits, rev: a.rev + c.rev, tx: a.tx + c.tx }), { visits: 0, rev: 0, tx: 0 })
  const crossOnly = cross.filter(c => c.cross).reduce((a, c) => ({ visits: a.visits + c.visits, rev: a.rev + c.rev }), { visits: 0, rev: 0 })

  return (
    <>
      <Section title="Trading by daypart" count={`${compact(dpTot.rev)} · ${n0(dpTot.tx)} TX`} open>
        <div className="grid g4">
          {dps.map((d, i) => {
            const fb = d.food + d.bev
            return (
              <div key={d.k} className="kpi" style={{ padding: '15px 16px' }}>
                <div className="kpi-l">{DP[i].icon} {DP[i].label} <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)', fontWeight: 400 }}>· {DP[i].hint}</span></div>
                <div className="kpi-v num">{compact(d.rev)}</div>
                <div style={{ margin: '8px 0 10px', fontSize: 11.5 }}>
                  <div className="num" style={{ color: 'var(--food)' }}>↳ Food {compact(d.food)} ({pct(fb ? d.food / fb : 0, 0)})</div>
                  <div className="num" style={{ color: 'var(--bev)' }}>↳ Bev {compact(d.bev)} ({pct(fb ? d.bev / fb : 0, 0)})</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11.5, color: 'var(--text-3)' }}>
                  <span>TX</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n0(d.tx)}</span>
                  <span>Visits</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n0(d.vis)}</span>
                  <span>Items</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n0(d.items)}</span>
                  <span>ATV</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>${n1(d.tx ? d.rev / d.tx : NaN)}</span>
                  <span>$ / visit</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>${n1(d.vis ? d.rev / d.vis : NaN)}</span>
                  <span>Items / TX</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n2(d.tx ? d.items / d.tx : NaN)}</span>
                </div>
              </div>
            )
          })}
          <div className="kpi" style={{ padding: '15px 16px' }}>
            <div className="kpi-l">Σ Total</div>
            <div className="kpi-v num">{compact(dpTot.rev)}</div>
            <div style={{ margin: '8px 0 10px', fontSize: 11.5 }}>
              <div className="num" style={{ color: 'var(--food)' }}>↳ Food {compact(dpTot.food)} ({pct(dpTot.food + dpTot.bev ? dpTot.food / (dpTot.food + dpTot.bev) : 0, 0)})</div>
              <div className="num" style={{ color: 'var(--bev)' }}>↳ Bev {compact(dpTot.bev)} ({pct(dpTot.food + dpTot.bev ? dpTot.bev / (dpTot.food + dpTot.bev) : 0, 0)})</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 11.5, color: 'var(--text-3)' }}>
              <span>TX</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n0(dpTot.tx)}</span>
              <span>Visits<span style={{ color: 'var(--accent)' }}>*</span></span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n0(trueVisits)}</span>
              <span>Items</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n0(dpTot.items)}</span>
              <span>ATV</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>${n1(dpTot.rev / dpTot.tx)}</span>
              <span>$ / visit</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>${n1(dpTot.rev / trueVisits)}</span>
              <span>Items / TX</span><span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{n2(dpTot.items / dpTot.tx)}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dps.map((d, i) => ({ name: DP[i].label, Food: d.food, Bev: d.bev }))} margin={{ left: 6, right: 8 }}>
              <CartesianGrid {...grid} vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} tickFormatter={v => '$' + (v / 1e6).toFixed(1) + 'm'} />
              <Tooltip content={<TT fmt={money} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
              <Bar maxBarSize={64} dataKey="Food" stackId="a" fill="var(--food)" />
              <Bar maxBarSize={64} dataKey="Bev" stackId="a" fill="var(--bev)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Trading by day of week" count={`peak ${dow.reduce((a, d) => (d.rev > a.rev ? d : a), dow[0]).day}`} open>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={dow} margin={{ left: 6, right: 8 }}>
            <CartesianGrid {...grid} vertical={false} />
            <XAxis dataKey="day" {...axis} />
            <YAxis {...axis} tickFormatter={v => '$' + (v / 1e6).toFixed(1) + 'm'} />
            <YAxis yAxisId="r" orientation="right" {...axis} tickFormatter={v => '$' + v.toFixed(0)} />
            <Tooltip content={<TT fmt={(v: number) => (v > 1000 ? money(v) : '$' + v.toFixed(2))} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
            <Bar maxBarSize={64} dataKey="rev" name="Revenue" fill="var(--s1)" radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="atv" name="ATV" stroke="var(--s3)" strokeWidth={2} dot={{ r: 2.5 }} />
            <Line yAxisId="r" type="monotone" dataKey="perVisit" name="$ / visit" stroke="var(--s2)" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Hourly trading profile — day × hour heatmap" open>
        <div className="card-s">
          Revenue by trade-day and clock hour. Day-of-week attribution uses a <b>4am trade-day boundary</b>: a transaction rung at 1am Tuesday
          belongs to <b>Monday</b>'s row at hour 1, because Monday-night service ran late. The hour axis stays clock-time and the grid is drawn
          6am → 5am so a night of trade reads left to right.
        </div>
        <Heatmap ds={ds} venue={venue} month={month} />
        <div style={{ marginTop: 22 }}>
          <div className="card-s">Average transaction value by hour — the shape of the basket across the day, independent of volume.</div>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={hourly} margin={{ left: 6, right: 8 }}>
              <CartesianGrid {...grid} vertical={false} />
              <XAxis dataKey="hour" {...axis} interval={0} />
              <YAxis {...axis} domain={[0, 'auto']} tickFormatter={v => '$' + v.toFixed(0)} />
              <Tooltip content={<TT fmt={(v: number) => (v > 500 ? money(v) : '$' + v.toFixed(2))} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
              <Line type="monotone" dataKey="atv" name="ATV" stroke="var(--s1)" strokeWidth={2.2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Daypart crossover (visit level)" count={`${pct(crossTot.visits ? crossOnly.visits / crossTot.visits : 0, 1)} of visits cross a daypart`} open>
        <div className="grid g2">
          <div>
            <div className="card-s">
              How many visits stay inside one daypart versus crossing two or three. Crossover visits are worth disproportionately more —
              they are the guests who arrive for one occasion and stay for the next.
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cross.map(c => ({ name: c.label, visits: c.visits, cross: c.cross }))} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid {...grid} horizontal={false} />
                <XAxis type="number" {...axis} tickFormatter={v => (v >= 1000 ? v / 1000 + 'k' : v)} />
                <YAxis type="category" dataKey="name" width={110} {...axis} />
                <Tooltip content={<TT />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                <Bar maxBarSize={64} dataKey="visits" name="Visits" radius={[0, 4, 4, 0]}>
                  {cross.map((c, i) => <RCell key={i} fill={c.cross ? 'var(--s1)' : '#4A4470'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="tw flat">
            <table>
              <thead><tr className="head"><th className="l">Pattern</th><th>Visits</th><th>% visits</th><th>TX</th><th>Revenue</th><th>$ / visit</th><th>TX / visit</th><th>% member</th></tr></thead>
              <tbody>
                {cross.map(c => (
                  <tr key={c.k} className={c.cross ? '' : undefined}>
                    <td className="l">{c.cross && <span style={{ color: 'var(--accent)', marginRight: 6 }}>↔</span>}{c.label}</td>
                    <td className="num">{n0(c.visits)}</td>
                    <td className="num">{pct(crossTot.visits ? c.visits / crossTot.visits : 0)}</td>
                    <td className="num">{n0(c.tx)}</td>
                    <td className="num">{money(c.rev)}</td>
                    <td className="num" style={{ color: c.cross ? 'var(--s2)' : undefined }}>${n1(c.visits ? c.rev / c.visits : NaN)}</td>
                    <td className="num">{n2(c.visits ? c.tx / c.visits : NaN)}</td>
                    <td className="num">{pct(c.visits ? c.mem / c.visits : 0, 0)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="l">All visits</td>
                  <td className="num">{n0(crossTot.visits)}</td><td className="num">100%</td>
                  <td className="num">{n0(crossTot.tx)}</td><td className="num">{money(crossTot.rev)}</td>
                  <td className="num">${n1(crossTot.rev / crossTot.visits)}</td>
                  <td className="num">{n2(crossTot.tx / crossTot.visits)}</td><td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Note>
        <ul>
          <li><b>Daypart bands</b>: Lunch before 15:00, Happy hour 15:00–17:59, Dinner from 18:00. A transaction is binned by its <b>opening hour</b>, so one spanning 14:55 → 15:10 is Lunch.</li>
          <li><b>* Total visits is not the sum of the three daypart tiles.</b> A visit spanning lunch and dinner is counted once in each band, so the bands sum to {n0(dpTot.vis)} against a true {n0(trueVisits)} visits. The Total tile shows the deduplicated figure, taken from the crossover analysis below.</li>
          <li><b>Food / Bev percentages inside each daypart tile are within-tile</b> (food ÷ (food + bev)), not a share of total revenue — operators want the mix at a glance.</li>
          <li>The <b>4am trade-day boundary applies to the heatmap only</b>. Daypart cards, day-of-week and crossover all use calendar-day attribution, consistent with the Benchmark and Members pages. The heatmap still reconciles to the same revenue and transaction totals — the rule only redistributes late trade between adjacent days.</li>
          <li>For the <b>crossover</b> view, hours 00:00–03:59 are grouped with Dinner of the same calendar date, so a 1am drink closes out the night it belongs to rather than opening a new one.</li>
        </ul>
      </Note>
    </>
  )
}
