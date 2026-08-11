import React, { useMemo, useState } from 'react'
import { ALL, Dataset, compact, monthLabel, n0, n1, n2, pct } from '../lib'
import { Standfirst } from '../components/v2ui'
import { Controls, Finding, Ledger, Method, Stat, StatGrid, Switcher } from '../components/thinkui'
import { band, decompose, judgeDays, mean, pearson, signedMoney, signedPct, splitVolumeRate } from '../stat'
import { CONF_STEPS, DAY_TYPES, dayType, days, inMonth } from './data'
import { Scope, isWholeGroup, scopeHistory, venuesOf } from './scope'

/**
 * Page four, and the one the brief actually asked for: why did the number move.
 *
 * The answer is not a model and not a narrative. A month-on-month change splits
 * exactly into the part caused by the months containing different days, and the
 * part caused by those days trading differently. The two always sum back to the
 * total, so there is nothing to believe or disbelieve — it is arithmetic, and it
 * routinely says the opposite of the headline.
 */
export default function Why({ ds, scope }: { ds: Dataset; scope: Scope }) {
  const list = venuesOf(ds, scope)
  // A month-on-month split needs both months, so the page reads the whole
  // history and uses the chosen period only to pick which pair it opens on.
  const all = useMemo(() => scopeHistory(ds, scope), [ds, scope])
  const traded = useMemo(() => ds.months.filter(m => inMonth(all, m).length > 0), [all, ds.months])

  const defaultNow = traded.includes(scope.period.to) ? scope.period.to : traded[traded.length - 1]
  const [now, setNow] = useState(defaultNow)
  const nowM = traded.includes(now) ? now : traded[traded.length - 1]
  const baseIdx = Math.max(0, traded.indexOf(nowM) - 1)
  const [base, setBase] = useState<string | null>(null)
  const baseM = base && traded.includes(base) && base !== nowM ? base : traded[baseIdx]

  const A = useMemo(() => inMonth(all, baseM), [all, baseM])
  const B = useMemo(() => inMonth(all, nowM), [all, nowM])

  const dec = useMemo(
    () => decompose(A.map(d => ({ key: dayType(d), value: d.rev })), B.map(d => ({ key: dayType(d), value: d.rev }))),
    [A, B],
  )

  const sum = (rows: typeof A, f: (d: typeof A[number]) => number) => rows.reduce((a, d) => a + f(d), 0)
  const visA = sum(A, d => d.vis), visB = sum(B, d => d.vis)
  const revA = sum(A, d => d.rev), revB = sum(B, d => d.rev)
  const txA = sum(A, d => d.tx), txB = sum(B, d => d.tx)
  const traffic = splitVolumeRate(visA, visA ? revA / visA : 0, visB, visB ? revB / visB : 0)
  const baskets = splitVolumeRate(txA, txA ? revA / txA : 0, txB, txB ? revB / txB : 0)

  // What is left once the calendar is held constant: the residual against each
  // day's own same-weekday expectation, tested against the weather it had.
  const judged = useMemo(
    () => judgeDays(all.map(d => ({ d: d.d, label: d.label, dow: d.dow, holiday: d.holiday, rev: d.rev })), { weeks: 8, conf: 0.95, mode: 'log', minN: 4 }),
    [all],
  )
  const wxRows = useMemo(() => {
    const byDate = new Map(all.map(d => [d.d, d]))
    return judged
      .filter(j => isFinite(j.expected))
      .map(j => ({ resid: j.actual - j.expected, day: byDate.get(j.d)! }))
      .filter(r => r.day && r.day.tmax != null)
  }, [judged, all])
  const rTemp = pearson(wxRows.map(r => r.day.tmax as number), wxRows.map(r => r.resid))
  const rRain = pearson(wxRows.map(r => r.day.mm ?? 0), wxRows.map(r => r.resid))

  const calShare = dec.delta ? dec.calendar / Math.abs(dec.delta) : NaN
  const flipped = Math.sign(dec.delta) !== Math.sign(dec.rate) && Math.abs(dec.rate) > Math.abs(dec.delta) * 0.15

  const partRows = [...dec.parts]
    .filter(p => p.n0 > 0 || p.n1 > 0)
    .sort((a, b) => DAY_TYPES.indexOf(a.key) - DAY_TYPES.indexOf(b.key))

  const maxTot = Math.max(dec.total0, dec.total1, dec.total0 + dec.calendar)
  const wpx = (v: number) => (maxTot ? (v / maxTot) * 100 : 0)

  const label = isWholeGroup(ds, scope) ? 'the group' : list.length === 1 ? list[0] : `the ${list.length} selected venues`

  return (
    <>
      <Standfirst
        question="Why did the number move?"
        sub={`${monthLabel(nowM)} against ${monthLabel(baseM)} at ${label}. A month is a bag of days, and two months are never the same bag. The first question is always how much of the change is the bag rather than the trading.`}
      />

      <Controls note={
        <>Both splits below are exact: each pair of parts adds back to the total change, with nothing left over and
        nothing estimated. They are two different questions about the same movement, not two halves of one — do not add
        them to each other.</>
      }>
        <Switcher label="Against" value={baseM} onChange={setBase}
          options={traded.filter(m => m !== nowM).map(m => ({ k: m, label: monthLabel(m) }))} />
        <Switcher label="Month" value={nowM} onChange={m => { setNow(m); if (m === baseM) setBase(null) }}
          options={traded.map(m => ({ k: m, label: monthLabel(m) }))} />
      </Controls>

      <Finding tone={flipped ? 'down' : dec.delta >= 0 ? 'up' : 'down'}>
        {label === 'the group' ? 'The group' : label} reported <b>{signedMoney(dec.delta)}</b> ({signedPct(dec.total0 ? dec.delta / dec.total0 : NaN)}).
        {' '}<b>{signedMoney(dec.calendar)}</b> of that is the calendar — {monthLabel(nowM)} simply contained a different
        set of days — and <b>{signedMoney(dec.rate)}</b> is the days themselves trading differently.
        {flipped
          ? <> The two point opposite ways: {label} {dec.delta > 0 ? 'reported growth while trading backwards' : 'reported a fall while trading ahead'}. That is the whole finding, and no percentage in the earlier editions could show it.</>
          : <> Both point the same way, so the headline is not being carried by the calendar this time.</>}
      </Finding>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">From {monthLabel(baseM)} to {monthLabel(nowM)}, in two exact steps</div>
        <div className="card-s">Each bar starts where the last one ended. The two middle bars are the entire explanation of the change.</div>
        <div className="wfall">
          {[
            { k: 'a', label: monthLabel(baseM), from: 0, to: dec.total0, kind: 'base', val: compact(dec.total0) },
            { k: 'b', label: 'Different days in the month', from: Math.min(dec.total0, dec.total0 + dec.calendar), to: Math.max(dec.total0, dec.total0 + dec.calendar), kind: dec.calendar >= 0 ? 'up' : 'down', val: signedMoney(dec.calendar) },
            { k: 'c', label: 'Those days trading differently', from: Math.min(dec.total0 + dec.calendar, dec.total1), to: Math.max(dec.total0 + dec.calendar, dec.total1), kind: dec.rate >= 0 ? 'up' : 'down', val: signedMoney(dec.rate) },
            { k: 'd', label: monthLabel(nowM), from: 0, to: dec.total1, kind: 'base', val: compact(dec.total1) },
          ].map(b => (
            <div className="wrow" key={b.k}>
              <div className="wlab">{b.label}</div>
              <div className="wtrack">
                <i className={'wbar ' + b.kind} style={{ left: wpx(b.from) + '%', width: Math.max(0.5, wpx(b.to - b.from)) + '%' }} />
              </div>
              <div className="wval num">{b.val}</div>
            </div>
          ))}
        </div>
      </div>

      <StatGrid>
        <Stat label="Calendar's share of the move" value={isFinite(calShare) ? n0(Math.abs(calShare) * 100) + '%' : '—'}
          tone={Math.abs(calShare) > 1 ? 'bad' : ''}
          foot={Math.abs(calShare) > 1 ? 'larger than the reported change itself' : 'of the reported change'} />
        <Stat label="Trading days" value={`${A.length} → ${B.length}`}
          foot={`${monthLabel(baseM)} to ${monthLabel(nowM)}`} />
        <Stat label="More people, or more each?" value={Math.abs(traffic.volume) > Math.abs(traffic.rate) ? 'More people' : 'More each'}
          foot={<>visits {signedMoney(traffic.volume)} · spend per visit {signedMoney(traffic.rate)}</>} />
        <Stat label="Weather's share of what's left"
          value={isFinite(rTemp.r2) ? pct(Math.max(rTemp.r2, rRain.r2), 1) : '—'}
          foot={<>after each day is judged against its own weekday, temperature explains {band(rTemp.r2)}</>} />
      </StatGrid>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-t">Which days changed the bag</div>
          <div className="card-s">
            How many of each kind of day each month had, what one of them was worth in {monthLabel(baseM)}, and what the
            difference in count alone was worth.
          </div>
          <div className="tw flat">
            <table className="v2t">
              <thead><tr className="head">
                <th className="l">Day</th><th>{monthLabel(baseM).slice(0, 3)}</th><th>{monthLabel(nowM).slice(0, 3)}</th>
                <th>Worth each</th><th>Calendar effect</th><th>Trading effect</th>
              </tr></thead>
              <tbody>
                {partRows.map(p => (
                  <tr key={p.key}>
                    <td className="l">{p.key}{p.imputed && <span className="tag" style={{ marginLeft: 6 }}>imputed</span>}</td>
                    <td className="num">{p.n0}</td>
                    <td className="num">{p.n1}</td>
                    <td className="num">{compact(p.r0)}</td>
                    <td className={'num ' + (p.cal > 0 ? 'pos' : p.cal < 0 ? 'neg' : '')}>{p.cal ? signedMoney(p.cal) : '—'}</td>
                    <td className={'num ' + (p.rate > 0 ? 'pos' : p.rate < 0 ? 'neg' : '')}>{p.rate ? signedMoney(p.rate) : '—'}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="l">Total</td>
                  <td className="num">{A.length}</td><td className="num">{B.length}</td><td />
                  <td className="num">{signedMoney(dec.calendar)}</td>
                  <td className="num">{signedMoney(dec.rate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {dec.imputedTypes.length > 0 && (
            <div className="chart-note">
              {dec.imputedTypes.join(', ')} did not occur in {monthLabel(baseM)}, so there is no rate to compare against and
              the month's own average day is used instead. The two parts still sum to the total exactly; only the split
              between them depends on that choice, and it is named here rather than hidden.
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-t">The same change, asked a different way</div>
          <div className="card-s">
            Revenue is people multiplied by what each spends. Either can move. This split is exact too, and it is a
            different question from the one above.
          </div>
          <div className="wfall">
            {[
              { k: 'v', label: 'More or fewer visits', v: traffic.volume },
              { k: 'p', label: 'More or less spent per visit', v: traffic.rate },
            ].map(b => {
              const lim = Math.max(Math.abs(traffic.volume), Math.abs(traffic.rate)) || 1
              return (
                <div className="wrow" key={b.k}>
                  <div className="wlab">{b.label}</div>
                  <div className="wtrack">
                    <i className="est-zero" />
                    <i className={'wbar ' + (b.v >= 0 ? 'up' : 'down')}
                      style={b.v >= 0
                        ? { left: '50%', width: (Math.abs(b.v) / lim) * 50 + '%' }
                        : { right: '50%', width: (Math.abs(b.v) / lim) * 50 + '%' }} />
                  </div>
                  <div className="wval num">{signedMoney(b.v)}</div>
                </div>
              )
            })}
          </div>
          <div className="dotplot" style={{ marginTop: 10 }}>
            <div className="dotrow"><div className="dotlab">Visits</div><div className="dottrack"><div className="dotline" /></div><div className="dotval num">{n0(visA)} → {n0(visB)}</div></div>
            <div className="dotrow"><div className="dotlab">$ per visit</div><div className="dottrack"><div className="dotline" /></div><div className="dotval num">${n2(visA ? revA / visA : NaN)} → ${n2(visB ? revB / visB : NaN)}</div></div>
            <div className="dotrow"><div className="dotlab">$ per transaction</div><div className="dottrack"><div className="dotline" /></div><div className="dotval num">${n2(txA ? revA / txA : NaN)} → ${n2(txB ? revB / txB : NaN)}</div></div>
          </div>
          <div className="chart-note">
            Basket view: transactions contributed {signedMoney(baskets.volume)} and the average transaction {signedMoney(baskets.rate)}.
            Visits and transactions answer different questions — one person can transact five times in a night.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">And what the weather did, which is less than anyone expects</div>
        <div className="card-s">
          Every day's distance from its own same-weekday expectation, against the temperature and the rainfall it had.
          If weather drove trade, these would slope.
        </div>
        <div className="grid g2">
          {[{ t: 'Maximum temperature', r: rTemp, xs: wxRows.map(r => r.day.tmax as number), unit: '°C' },
            { t: 'Rainfall', r: rRain, xs: wxRows.map(r => r.day.mm ?? 0), unit: 'mm' }].map(s => {
            const ys = wxRows.map(r => r.resid)
            const xlo = Math.min(...s.xs), xhi = Math.max(...s.xs)
            // One Anzac Day would otherwise flatten every other point onto the
            // axis, so the vertical scale is the middle 95% and the handful of
            // points outside it are drawn on the edge and counted.
            const sortedAbs = ys.map(Math.abs).sort((a, b) => a - b)
            const ylim = sortedAbs[Math.floor(sortedAbs.length * 0.95)] || 1
            const clipped = ys.filter(v => Math.abs(v) > ylim).length
            return (
              <div key={s.t}>
                <div className="chart-t">{s.t}</div>
                <svg viewBox="0 0 300 150" className="scatter" preserveAspectRatio="none">
                  <line x1={0} y1={75} x2={300} y2={75} className="grid" />
                  {s.xs.map((x, i) => (
                    <circle key={i} cx={4 + ((x - xlo) / (xhi - xlo || 1)) * 292}
                      cy={75 - Math.max(-1, Math.min(1, ys[i] / ylim)) * 68} r={2.1}
                      className={Math.abs(ys[i]) > ylim ? 'clip' : ''} />
                  ))}
                </svg>
                <div className="scatter-ax"><span>{Math.round(xlo)}{s.unit}</span><span>{Math.round(xhi)}{s.unit}</span></div>
                <div className="chart-note">
                  r = {n2(s.r.r)} ({isFinite(s.r.lo) ? `${n2(s.r.lo)} to ${n2(s.r.hi)}` : '—'}), so it accounts for
                  {' '}<b>{band(s.r.r2)}</b> of what is left after the weekday is taken out — {pct(s.r.r2, 1)} of the variation,
                  over {s.r.n} days.{clipped > 0 && <> {clipped} {clipped === 1 ? 'day sits' : 'days sit'} beyond the vertical scale and {clipped === 1 ? 'is' : 'are'} drawn on the edge.</>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="chart-note">
          The weather feed is a nearest-station proxy that stops at {ds.meta.wxEnds}, so this is a hint about the day rather
          than a measurement at the door. Even taken at face value it does not carry the explanation, and any answer that
          leans on it is leaning on {pct(Math.max(rTemp.r2, rRain.r2), 1)} of the variation.
        </div>
      </div>

      <Ledger
        where="both earlier editions"
        was={<>Reported the month-on-month percentage and, in New, ranked venues by it under “Losing ground” and “Pulling ahead”.</>}
        is={<>
          A percentage compares two bags of days without saying that they are different bags. {monthLabel(baseM)} and
          {' '}{monthLabel(nowM)} differ by {Math.abs(B.length - A.length)} trading {Math.abs(B.length - A.length) === 1 ? 'day' : 'days'} and
          by their mix of weekdays, and a Friday is worth several Mondays. Until that is removed, the percentage is not a
          statement about trading.
        </>}
      />

      <Method formula={`Δ = Σ_t (n1_t − n0_t)·r0_t   +   Σ_t n1_t·(r1_t − r0_t)
       ^ calendar: different days   ^ trading: same days, different takings

t   day type: Mon…Sun, with public holidays as their own type
n   how many of that day type the month contained
r   the average taken on that day type in that month

revenue split:   Δ = (q1 − q0)·p0 + q1·(p1 − p0)     q visits, p spend per visit`}>
        <p>
          Both identities are exact by construction: substitute and the middle terms cancel, leaving
          {' '}<b>Σn1·r1 − Σn0·r0</b>, the total change. Nothing is fitted, so there is no model risk and no
          coefficient to argue about — the only judgement in the whole page is the choice of day type, and that is stated.
        </p>
        <p>
          Public holidays are given their own type rather than being treated as unusual Mondays, because a public holiday
          is a different trading day with a different staffing plan and a different menu.
        </p>
        <p>
          <b>What this does not say.</b> The split is an accounting identity, not a cause. “Those days traded differently”
          is a place to look, not a reason. The weather panel is a correlation on a proxy feed and it is presented in bands
          rather than percentages precisely because a single window of this size cannot earn a decimal place.
        </p>
      </Method>
    </>
  )
}
