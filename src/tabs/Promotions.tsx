import React, { useMemo, useState } from 'react'
import { ALL, Bench, CAT_COLOR, Dataset, PROMO_CATS, compact, money, n0, n1, n2, pct } from '../lib'
import { Kpi, Note, Section } from '../components/ui'
import { Bar, BarChart, CartesianGrid, Cell as RCell, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

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

export default function Promotions({ ds, bench, venue, month }: { ds: Dataset; bench: Bench; venue: string; month: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Promotion: true })
  const all = bench.get(venue, ALL, month, 'all')
  const imp = ds.promoImpacted.find(r => r.v === venue && r.m === month) || { v: venue, m: month, txs: 0, rev: 0, disc: 0, memTxs: 0 }

  const tags = useMemo(() => ds.promoTag.filter(r => r.v === venue && r.m === month), [ds, venue, month])
  const byCat = useMemo(() => PROMO_CATS.map(c => {
    const rows = tags.filter(t => t.c === c).sort((a, b) => b.disc - a.disc)
    return {
      cat: c, rows,
      txs: rows.reduce((a, r) => a + r.txs, 0),
      impRev: rows.reduce((a, r) => a + r.impRev, 0),
      disc: rows.reduce((a, r) => a + r.disc, 0),
      lines: rows.reduce((a, r) => a + r.lines, 0),
    }
  }).filter(c => c.disc !== 0 || c.txs), [tags])

  const topPromos = useMemo(() => tags.filter(t => t.c === 'Promotion').sort((a, b) => b.disc - a.disc).slice(0, 3), [tags])

  const trend = useMemo(() => ds.months.map(m => {
    const row: any = { m: m.slice(5) }
    for (const c of PROMO_CATS) {
      row[c] = ds.promoTag.filter(t => t.v === venue && t.m === m && t.c === c).reduce((a, r) => a + r.disc, 0)
    }
    const i = ds.promoImpacted.find(r => r.v === venue && r.m === m)
    const b = bench.get(venue, ALL, m, 'all')
    row.rate = b.tx && i ? (i.txs / b.tx) * 100 : 0
    return row
  }), [ds, venue, bench])

  const gross = all.rev + all.disc
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Total revenue" value={compact(all.rev)} detail={<>gross before discount <b>{compact(gross)}</b></>} />
        <Kpi label="Revenue impacted" value={compact(imp.rev)} detail={<>{pct(all.rev ? imp.rev / all.rev : 0, 1)} <b>of revenue</b></>} />
        <Kpi label="TX impacted" value={n0(imp.txs)} detail={<>{pct(all.tx ? imp.txs / all.tx : 0, 1)} <b>of transactions</b></>} />
        <Kpi label="Discount given" value={compact(all.disc)} detail={<>{pct(gross ? all.disc / gross : 0, 2)} <b>of gross sales</b></>} />
        <Kpi label="Avg discount / impacted TX" value={'$' + n1(imp.txs ? imp.disc / imp.txs : NaN)} detail={<>on <b>${n1(imp.txs ? imp.rev / imp.txs : NaN)}</b> baskets</>} />
        <Kpi label="Member share of impacted" value={pct(imp.txs ? imp.memTxs / imp.txs : 0, 1)} detail={<>of discounted transactions</>} />
      </div>

      <Section title="Discount categories" count={`${n0(byCat.length)} categories · ${compact(byCat.reduce((a, c) => a + c.disc, 0))} given`} open>
        <div className="tw flat">
          <table>
            <thead>
              <tr className="head">
                <th className="l" style={{ minWidth: 240 }}>Category / tag</th>
                <th>Discount lines</th><th>TX touched</th><th>% of TX</th>
                <th>Revenue on those TX</th><th>% of revenue</th><th>$ given</th><th>Effective discount</th><th />
              </tr>
            </thead>
            <tbody>
              {byCat.map(c => (
                <React.Fragment key={c.cat}>
                  <tr className="venue">
                    <td className="l">
                      <span style={{ cursor: 'pointer' }} onClick={() => setOpen(o => ({ ...o, [c.cat]: !o[c.cat] }))}>
                        <span style={{ color: 'var(--accent)', marginRight: 7, fontSize: 11 }}>{open[c.cat] ? '▾' : '▸'}</span>
                        <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: CAT_COLOR[c.cat], marginRight: 8 }} />
                        {c.cat}
                      </span>
                    </td>
                    <td className="num">{n0(c.lines)}</td>
                    <td className="num">{n0(c.txs)}</td>
                    <td className="num">{pct(all.tx ? c.txs / all.tx : 0)}</td>
                    <td className="num">{money(c.impRev)}</td>
                    <td className="num">{pct(all.rev ? c.impRev / all.rev : 0)}</td>
                    <td className="num">{money(c.disc)}</td>
                    <td className="num">{pct(c.impRev + c.disc ? c.disc / (c.impRev + c.disc) : 0, 2)}</td>
                    <td style={{ width: 120 }}><div className="bar"><i style={{ width: pct(byCat[0].disc ? c.disc / Math.max(...byCat.map(x => x.disc)) : 0, 0), background: CAT_COLOR[c.cat] }} /></div></td>
                  </tr>
                  {open[c.cat] && c.rows.map(r => (
                    <tr key={c.cat + r.t} className="sub">
                      <td className="l">{r.t}</td>
                      <td className="num">{n0(r.lines)}</td>
                      <td className="num">{n0(r.txs)}</td>
                      <td className="num">{pct(all.tx ? r.txs / all.tx : 0)}</td>
                      <td className="num">{money(r.impRev)}</td>
                      <td className="num">{pct(all.rev ? r.impRev / all.rev : 0)}</td>
                      <td className="num">{money(r.disc)}</td>
                      <td className="num">{pct(r.impRev + r.disc ? r.disc / (r.impRev + r.disc) : 0, 2)}</td>
                      <td />
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              <tr className="total">
                <td className="l">Total — deduplicated</td>
                <td className="num">{n0(byCat.reduce((a, c) => a + c.lines, 0))}</td>
                <td className="num">{n0(imp.txs)}</td>
                <td className="num">{pct(all.tx ? imp.txs / all.tx : 0)}</td>
                <td className="num">{money(imp.rev)}</td>
                <td className="num">{pct(all.rev ? imp.rev / all.rev : 0)}</td>
                <td className="num">{money(imp.disc)}</td>
                <td className="num">{pct(imp.rev + imp.disc ? imp.disc / (imp.rev + imp.disc) : 0, 2)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Discount trend" count="by category, across the window" open>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={trend} margin={{ left: 6, right: 8 }}>
            <CartesianGrid {...grid} vertical={false} />
            <XAxis dataKey="m" {...axis} />
            <YAxis {...axis} domain={[0, 'auto']} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
            <YAxis yAxisId="r" orientation="right" {...axis} unit="%" />
            <Tooltip content={<TT fmt={(v: number) => (v > 200 ? money(v) : v.toFixed(1) + '%')} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
            {PROMO_CATS.map((c, i) => <Bar key={c} dataKey={c} stackId="a" fill={CAT_COLOR[c]} radius={i === PROMO_CATS.length - 1 ? [4, 4, 0, 0] : undefined} />)}
            <Line yAxisId="r" type="monotone" dataKey="rate" name="% TX discounted" stroke="#EDEAF7" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>

      {topPromos.map((p, i) => {
        const perMonth = ds.months.map(m => {
          const r = ds.promoTag.find(t => t.v === venue && t.m === m && t.t === p.t)
          const b = bench.get(venue, ALL, m, 'all')
          return { m: m.slice(5), disc: r?.disc || 0, txs: r?.txs || 0, rate: b.tx && r ? (r.txs / b.tx) * 100 : 0, impRev: r?.impRev || 0 }
        })
        const byVenue = ds.promoTag.filter(t => t.m === month && t.t === p.t && t.v !== ALL).sort((a, b) => b.disc - a.disc).slice(0, 8)
        const effective = p.impRev + p.disc ? p.disc / (p.impRev + p.disc) : 0
        return (
          <Section key={p.t} title={`Deep dive ${i + 1} — ${p.t}`} count={`${money(p.disc)} given · ${n0(p.txs)} TX`} open={i === 0}>
            <div className="grid g3" style={{ marginBottom: 16 }}>
              <div className="kpi"><div className="kpi-l">Discounted lines</div><div className="kpi-v num">{n0(p.lines)}</div><div className="kpi-d">across {n0(p.txs)} transactions</div></div>
              <div className="kpi"><div className="kpi-l">Revenue on those baskets</div><div className="kpi-v num">{compact(p.impRev)}</div><div className="kpi-d">{pct(all.rev ? p.impRev / all.rev : 0, 1)} of venue revenue</div></div>
              <div className="kpi"><div className="kpi-l">Discount given</div><div className="kpi-v num">{compact(p.disc)}</div><div className="kpi-d">{pct(effective, 2)} effective rate</div></div>
              <div className="kpi"><div className="kpi-l">Avg give per TX</div><div className="kpi-v num">${n1(p.txs ? p.disc / p.txs : NaN)}</div><div className="kpi-d">on ${n1(p.txs ? p.impRev / p.txs : NaN)} baskets</div></div>
              <div className="kpi"><div className="kpi-l">Reach</div><div className="kpi-v num">{pct(all.tx ? p.txs / all.tx : 0, 1)}</div><div className="kpi-d">of all transactions</div></div>
              <div className="kpi"><div className="kpi-l">Discount lines per TX</div><div className="kpi-v num">{n2(p.txs ? p.lines / p.txs : NaN)}</div><div className="kpi-d">how often it fires per basket</div></div>
            </div>
            <div className="grid g2">
              <div>
                <div className="card-s">Give and reach by month — is the mechanic growing, steady, or being wound back?</div>
                <ResponsiveContainer width="100%" height={230}>
                  <ComposedChart data={perMonth} margin={{ left: 6, right: 8 }}>
                    <CartesianGrid {...grid} vertical={false} />
                    <XAxis dataKey="m" {...axis} />
                    <YAxis {...axis} domain={[0, 'auto']} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                    <YAxis yAxisId="r" orientation="right" {...axis} unit="%" />
                    <Tooltip content={<TT fmt={(v: number) => (v > 200 ? money(v) : v.toFixed(1) + '%')} />} cursor={{ fill: 'rgba(139,111,232,.07)' }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#A29CBF' }} />
                    <Bar maxBarSize={64} dataKey="disc" name="$ given" fill="var(--s1)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="r" type="monotone" dataKey="rate" name="% TX reached" stroke="var(--s3)" strokeWidth={2} dot={{ r: 2.5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="tw" style={{ maxHeight: 300 }}>
                <table>
                  <thead><tr className="head"><th className="l">Venue</th><th>TX</th><th>$ given</th><th>Effective rate</th></tr></thead>
                  <tbody>
                    {byVenue.map(v => (
                      <tr key={v.v}>
                        <td className="l">{v.v}</td>
                        <td className="num">{n0(v.txs)}</td>
                        <td className="num">{money(v.disc)}</td>
                        <td className="num">{pct(v.impRev + v.disc ? v.disc / (v.impRev + v.disc) : 0, 2)}</td>
                      </tr>
                    ))}
                    {!byVenue.length && <tr><td className="l" colSpan={4} style={{ color: 'var(--text-3)' }}>Select "All venues" to compare venue-by-venue.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        )
      })}

      <Note title="Methodology — how these numbers are built">
        <ul>
          <li><b>Revenue per category</b> is the sum of the full basket value of every transaction carrying at least one discount line in that category. It is <b>not</b> the discounted amount — it answers "how much trade did this mechanic touch".</li>
          <li>A transaction touched by more than one category is counted <b>in each</b>. Category rows therefore over-count against the whole; the <b>Total row uses a deduplicated transaction count</b>, which is why it is smaller than the sum of the rows above it.</li>
          <li><b>$ given is honest at every level</b> — one discount line carries exactly one tag, so tag, category and total all sum correctly.</li>
          <li><b>Effective discount</b> = $ given ÷ (revenue on those baskets + $ given), i.e. the discount as a share of the gross value of the baskets it touched.</li>
          <li>Categories are auto-classified from the POS discount tag: <b>Promotion</b> (campaign-driven), <b>Member</b> (always-on member benefit), <b>Voucher</b>, <b>Staff</b>, <b>Manual</b> (operator-applied, no named campaign — including the system "Condiment Zero Price" mechanic).</li>
        </ul>
      </Note>
    </>
  )
}
