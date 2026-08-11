import React, { useMemo, useState } from 'react'
import { ALL, Dataset, compact, money, monthLabel, n0, n1, pct } from '../lib'
import { Standfirst } from '../components/v2ui'
import { Controls, Dial, Finding, Ledger, Method, Stat, StatGrid, Switcher, Verdict } from '../components/thinkui'
import { BandMode, JudgedDay, judgeDays, mean, median, sd, signedPct, varianceExplained } from '../stat'
import { CONF_STEPS, days, dowShort, shortDate } from './data'

/**
 * Page two. A day is judged against days like it — same venue, same weekday,
 * recent — instead of against a rolling average that has Saturday inside it.
 *
 * This is the Interval Estimation lesson made operational: coverage is a
 * property of the procedure, not of any one interval. The reader can move the
 * confidence and watch the number of "unusual" days move with it, which is the
 * fastest way to understand that an alert threshold is a choice about how often
 * you are willing to be wrong.
 */
const W = 1120, H = 320, PADL = 66, PADR = 16, PADT = 18, PADB = 46

export default function Normal({ ds, venue, month }: { ds: Dataset; venue: string; month: string }) {
  const [weeks, setWeeks] = useState(8)
  const [confIdx, setConfIdx] = useState(2)
  const [mode, setMode] = useState<BandMode>('log')
  const [hover, setHover] = useState<JudgedDay | null>(null)
  const conf = CONF_STEPS[confIdx]

  const all = useMemo(() => days(ds, venue), [ds, venue])

  const judged = useMemo(
    () => judgeDays(all.map(d => ({ d: d.d, label: d.label, dow: d.dow, holiday: d.holiday, rev: d.rev })), { weeks, conf, mode, minN: 4 }),
    [all, weeks, conf, mode],
  )

  // The same window judged all three ways, so "which rule should I use" is
  // answered by the counts on the page rather than by an assertion in a footnote.
  const calibration = useMemo(() => (['mean', 'robust', 'log'] as BandMode[]).map(m => {
    const j = judgeDays(all.map(d => ({ d: d.d, label: d.label, dow: d.dow, holiday: d.holiday, rev: d.rev })), { weeks, conf, mode: m, minN: 4 })
    const jd = j.filter(x => x.state === 'above' || x.state === 'below' || x.state === 'normal')
    return {
      mode: m,
      above: j.filter(x => x.state === 'above').length,
      below: j.filter(x => x.state === 'below').length,
      judged: jd.length,
      expected: jd.length * (1 - conf),
    }
  }), [all, weeks, conf])

  // The chart shows the chosen month, or the last ninety days when the filter
  // is on "all months" — a 212-day line at this width is a texture, not a chart.
  const view = useMemo(() => {
    if (month !== ALL) return judged.filter(j => j.d.slice(0, 7) === month)
    return judged.slice(-90)
  }, [judged, month])

  const judgedOnly = judged.filter(j => j.state === 'above' || j.state === 'below' || j.state === 'normal')
  const outside = judged.filter(j => j.state === 'above' || j.state === 'below')
  const expectedFalse = judgedOnly.length * (1 - conf)
  const above = outside.filter(o => o.state === 'above').length
  const below = outside.filter(o => o.state === 'below').length
  // A one-sided excess is a distributional artefact, not a trading finding.
  const lopsided = outside.length >= 6 && Math.max(above, below) >= outside.length * 0.75
  const thin = judged.filter(j => j.state === 'thin').length

  // How much of the daily line is just the calendar.
  const trading = all.filter(d => !d.holiday)
  const dowShare = varianceExplained(trading.map(d => d.rev), trading.map(d => d.dow))
  const dowStats = useMemo(() => {
    const out: { dow: number; xs: number[] }[] = []
    for (let k = 0; k < 7; k++) out.push({ dow: k, xs: trading.filter(d => d.dow === k).map(d => d.rev) })
    return out.filter(o => o.xs.length > 1)
  }, [trading])

  const revsAll = all.map(d => d.rev)
  const mn = mean(revsAll), md = median(revsAll)
  const biggest = all.reduce((a, d) => (d.rev > (a?.rev ?? -1) ? d : a), null as any)
  const topShare = biggest && revsAll.length ? biggest.rev / revsAll.reduce((a, b) => a + b, 0) : NaN

  const lo = Math.min(...view.map(v => Math.min(v.actual, isFinite(v.lo) ? v.lo : v.actual)))
  const hi = Math.max(...view.map(v => Math.max(v.actual, isFinite(v.hi) ? v.hi : v.actual)))
  const yMax = hi * 1.06, yMin = Math.min(0, lo * 0.94)
  const x = (i: number) => PADL + (i / Math.max(1, view.length - 1)) * (W - PADL - PADR)
  const y = (v: number) => PADT + (1 - (v - yMin) / (yMax - yMin)) * (H - PADT - PADB)
  const bw = Math.max(2, ((W - PADL - PADR) / Math.max(1, view.length)) * 0.5)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => yMin + f * (yMax - yMin))
  const actualLine = view.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v.actual).toFixed(1)}`).join(' ')

  const label = venue === ALL ? 'the group' : venue

  return (
    <>
      <Standfirst
        question={venue === ALL ? 'Is this day unusual, or is this just what the group does?' : `Is this day unusual, or is this just what ${venue} does?`}
        sub="Each day is compared with its own recent same-weekday history, and only with that. The shaded range is where the next such day would be expected to land — a prediction interval, not a confidence interval on an average."
      />

      <Controls note={
        <>Nothing about the trading changes when you move these. What changes is how much evidence a day needs before
        the page is willing to call it unusual. At {Math.round(conf * 100)}% confidence the procedure is designed to put
        roughly {pct(1 - conf, 0)} of ordinary days outside the range, which is why the count below is compared with
        what chance alone produces.</>
      }>
        <Dial label="Same-weekday history" value={weeks} min={4} max={20} display={weeks + ' weeks'}
          hint="how many recent Mondays define a normal Monday" onChange={setWeeks} />
        <Switcher label="Confidence" value={String(confIdx)} onChange={k => setConfIdx(+k)}
          options={CONF_STEPS.map((c, i) => ({ k: String(i), label: Math.round(c * 100) + '%' }))} />
        <Switcher label="How the range is built" value={mode} onChange={k => setMode(k as BandMode)}
          options={[
            { k: 'mean', label: 'Mean ± spread', title: 'symmetric, and widened by the same big days it is meant to catch' },
            { k: 'robust', label: 'Median ± IQR', title: 'describes the typical day; a narrower band, so more days fall outside it' },
            { k: 'log', label: 'Multiplicative', title: 'the same arithmetic on log revenue — asymmetric in dollars, which matches the data' },
          ]} />
      </Controls>

      <Finding tone={outside.length > expectedFalse * 1.6 ? 'down' : 'flat'}>
        <b>{outside.length}</b> of {judgedOnly.length} judged days fall outside the expected range across the whole window.
        The procedure itself produces about <b>{n1(expectedFalse)}</b> at this setting, whatever the trading did.
        {outside.length <= expectedFalse * 1.3
          ? <> There is no more unusual behaviour here than the method generates on its own — a list of these days would be a list of coincidences.</>
          : lopsided
            ? <> But {n0(Math.max(above, below))} of the {outside.length} fall on {above > below ? 'the high' : 'the low'} side.
                A one-sided excess is the shape of the data rather than the trading: daily revenue is right-skewed, and a
                symmetric range cannot sit correctly on it. The <b>Multiplicative</b> setting builds the range on log
                revenue instead, and the table below shows what that does to the count.</>
            : <> The excess of {n0(Math.max(0, outside.length - expectedFalse))} is split evenly enough between high and
                low days to be worth reading as trading rather than as shape.</>}
      </Finding>

      <StatGrid>
        <Stat label="Days outside the range" value={n0(outside.length)}
          foot={<>{n0(outside.filter(o => o.state === 'above').length)} above, {n0(outside.filter(o => o.state === 'below').length)} below</>} />
        <Stat label="Produced by chance alone" value={n1(expectedFalse)}
          foot={<>{judgedOnly.length} judged days × {pct(1 - conf, 0)}. Investigate every flag and this many are wasted trips.</>} />
        <Stat label="Explained by the day of the week" value={pct(dowShare, 0)}
          foot="share of daily variation that disappears once each weekday is judged against itself" />
        <Stat label="Days that cannot be judged" value={n0(thin)}
          foot={`fewer than four comparable weekdays behind them — the opening weeks, and every public holiday`} />
      </StatGrid>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <div className="card-t">{month === ALL ? 'The last ninety trading days' : monthLabel(month)} at {label}</div>
        </div>
        <div className="card-s">
          The grey column on each day is where that weekday normally lands. The dot is what actually happened.
          Colour appears only when a day sits outside its own range.
        </div>
        <div style={{ position: 'relative', overflowX: 'auto' }}>
          <svg width={W} height={H} className="daily think" onMouseLeave={() => setHover(null)}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} className="grid" />
                <text x={PADL - 8} y={y(t) + 3.5} textAnchor="end" className="axis">{compact(t)}</text>
              </g>
            ))}

            {view.map((v, i) => v.state === 'holiday' && (
              <rect key={'h' + v.d} x={x(i) - bw} y={PADT} width={bw * 2} height={H - PADT - PADB} className="holband" />
            ))}

            {/* the expected range for each day, drawn as the day's own column */}
            {view.map((v, i) => isFinite(v.lo) && (
              <rect key={'b' + v.d} x={x(i) - bw / 2} y={y(v.hi)} width={bw} height={Math.max(1, y(v.lo) - y(v.hi))}
                className="expband" />
            ))}
            {view.map((v, i) => isFinite(v.expected) && (
              <line key={'e' + v.d} x1={x(i) - bw / 2} y1={y(v.expected)} x2={x(i) + bw / 2} y2={y(v.expected)} className="expmid" />
            ))}

            <path d={actualLine} className="dayline" />

            {view.map((v, i) => (
              <circle key={'d' + v.d} cx={x(i)} cy={y(v.actual)} r={v.state === 'above' || v.state === 'below' ? 4 : 2.4}
                className={'daydot s-' + v.state} />
            ))}

            {view.map((v, i) => (
              <g key={'hit' + v.d}>
                {hover?.d === v.d && <line x1={x(i)} y1={PADT} x2={x(i)} y2={H - PADB} className="crosshair" />}
                <rect x={x(i) - (W - PADL - PADR) / view.length / 2} y={PADT}
                  width={(W - PADL - PADR) / view.length} height={H - PADT - PADB}
                  fill="transparent" onMouseEnter={() => setHover(v)} />
              </g>
            ))}

            {view.map((v, i) => (i % Math.ceil(view.length / 22) === 0) && (
              <text key={'x' + v.d} x={x(i)} y={H - PADB + 16} textAnchor="middle" className="axis">{v.label}</text>
            ))}
          </svg>

          {hover && (
            <div className="tt daily-tt" style={{ left: Math.min(x(view.indexOf(hover)) + 12, W - 260) }}>
              <div style={{ fontWeight: 620, marginBottom: 4 }}>
                {dowShort(hover.dow)} {hover.label} <Verdict kind={hover.state} />
              </div>
              <div className="num">{money(hover.actual)} actual</div>
              {isFinite(hover.expected)
                ? <>
                    <div className="num" style={{ color: 'var(--text-3)' }}>
                      expected {money(hover.expected)}, range {money(hover.lo)} to {money(hover.hi)}
                    </div>
                    <div className="num" style={{ color: 'var(--text-3)' }}>
                      {n1(Math.abs(hover.z))} spreads {hover.z >= 0 ? 'above' : 'below'} · from {hover.n} recent {dowShort(hover.dow)}s
                    </div>
                  </>
                : <div style={{ color: 'var(--text-3)' }}>
                    {hover.state === 'holiday' ? 'a public holiday — a different trading day, not an unusual one' : `only ${hover.n} comparable ${dowShort(hover.dow)}s behind it`}
                  </div>}
            </div>
          )}
        </div>
        <div className="calib">
          <div className="calib-h">Which rule is honest? Judge the same {calibration[0].judged} days three ways and compare the counts with what chance alone produces ({n1(calibration[0].expected)}).</div>
          {calibration.map(c => (
            <div key={c.mode} className={'calib-row' + (c.mode === mode ? ' on' : '')}>
              <span className="calib-k">{c.mode === 'mean' ? 'Mean ± spread' : c.mode === 'robust' ? 'Median ± IQR' : 'Multiplicative'}</span>
              <span className="calib-b num">{c.above + c.below} outside</span>
              <span className="calib-s num">{c.above} above · {c.below} below</span>
              <span className="calib-v num">{n1((c.above + c.below) / c.expected)}× expected</span>
            </div>
          ))}
          <div className="calib-f">
            A rule that is well behaved lands close to 1× and splits evenly. The symmetric ones do not, in both
            directions: the mean band is widened by the big days and then flags only big days; the robust band is
            narrower than the data and flags too much of everything. Neither is wrong arithmetic — they are the wrong
            shape for revenue, and this is what "check the model" looks like when it is on the surface instead of in a
            notebook.
          </div>
        </div>

        <div className="legend">
          <span><i style={{ background: 'var(--line)' }} />Expected range for that weekday</span>
          <span><i style={{ background: 'var(--accent)' }} />Actual</span>
          <span><i style={{ background: 'var(--pos)' }} />Above its range</span>
          <span><i style={{ background: 'var(--neg)' }} />Below its range</span>
          <span><i style={{ background: 'rgba(240,166,60,.30)' }} />Public holiday, not judged</span>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-t">Why the raw daily line looks chaotic</div>
          <div className="card-s">
            Every trading day in the window, grouped by weekday. The spread inside a column is variation;
            the gap between columns is the calendar. At {label} the calendar is <b>{pct(dowShare, 0)}</b> of it.
          </div>
          <div className="dowplot">
            {(() => {
              const allx = dowStats.flatMap(o => o.xs)
              const mx = Math.max(...allx), mnv = Math.min(...allx)
              return dowStats.map(o => {
                const m = mean(o.xs)
                return (
                  <div className="dowrow" key={o.dow}>
                    <div className="dowlab">{dowShort(o.dow)}</div>
                    <div className="dowtrack">
                      {o.xs.map((v, i) => (
                        <i key={i} className="dowdot" style={{ left: ((v - mnv) / (mx - mnv || 1)) * 100 + '%' }} />
                      ))}
                      <i className="dowmean" style={{ left: ((m - mnv) / (mx - mnv || 1)) * 100 + '%' }} />
                    </div>
                    <div className="dowval num">{compact(m)}</div>
                  </div>
                )
              })
            })()}
          </div>
          <div className="chart-note">
            Comparing a Monday with last week's seven-day average is comparing it with a number that has
            two weekend nights inside it. That is where most "the day was down" findings come from.
          </div>
        </div>

        <div className="card">
          <div className="card-t">One day can own the average</div>
          <div className="card-s">
            The mean and the median of a trading day at {label}, and the single largest day in the window.
          </div>
          {(() => {
            const hiV = Math.max(mn, md) * 1.25
            const at = (v: number) => Math.max(0, Math.min(100, (v / hiV) * 100))
            return (
              <div className="dotplot" style={{ paddingTop: 2 }}>
                <div className="dotrow"><div className="dotlab">Mean day</div><div className="dottrack"><div className="dotline" /><div className="dotmark" style={{ left: at(mn) + '%', background: 'var(--s1)' }} /></div><div className="dotval num">{compact(mn)}</div></div>
                <div className="dotrow"><div className="dotlab">Median day</div><div className="dottrack"><div className="dotline" /><div className="dotmark" style={{ left: at(md) + '%', background: 'var(--s2)' }} /></div><div className="dotval num">{compact(md)}</div></div>
              </div>
            )
          })()}
          {biggest && (
            <div className="attn flat" style={{ marginTop: 6 }}>
              <div className="attn-body">
                <div className="attn-title">{biggest.label}{biggest.holiday ? ` · ${biggest.holiday}` : ''} — {compact(biggest.rev)}</div>
                <div className="attn-detail">
                  {pct(topShare, 1)} of everything {label} took in the whole window, on {pct(1 / all.length, 1)} of the days.
                  {mn > md * 1.15 && <> The mean day is {pct(mn / md - 1, 0)} above the median, which is what a tail does to an average.</>}
                </div>
              </div>
            </div>
          )}
          <div className="chart-note">
            Hospitality revenue is heavy-tailed. A mean-and-standard-deviation band applied to it without checking is
            confident about the wrong thing: the same day that should be flagged is also the day widening the range that
            is supposed to flag it.
          </div>
        </div>
      </div>

      <Ledger
        where="the New edition"
        was={<>Drew a seven-day rolling average through the daily line and put weather and holidays alongside it as context.</>}
        is={<>
          A rolling average is a smoothing, not an expectation: it contains the weekend it is being compared with, and it
          has no width, so no day can ever be called normal or not. Same-weekday history gives an expectation and a range;
          holidays are removed from the comparison rather than drawn next to it.
        </>}
      />

      <Method formula={`comparable days   the last k same-weekday, non-holiday trading days at this venue
centre            mean (or median when Robust is on)
spread            s (or IQR / 1.349 when Robust is on)
range             centre ± t(conf, k−1) · s · √(1 + 1/k)
verdict           actual outside the range ⇒ above / below normal`}>
        <p>
          The <b>√(1 + 1/k)</b> is the difference between an interval for tomorrow and an interval for the average day.
          It is always the wider one, and it is the one an operator needs. Presenting the narrower interval as a forecast
          band is the easiest mistake to make from a first statistics course and it is the one this page refuses.
        </p>
        <p>
          A day is never used to judge itself: the history runs strictly backwards from the day being judged, which is why
          the opening weeks of the window return “not enough data” instead of a suspiciously accurate verdict.
        </p>
        <p>
          <b>What this does not say.</b> Outside the range means unusual for that weekday, not wrong, not caused by
          anything, and not necessarily worth acting on. Consecutive days are not independent, so a run of three below-range
          days is weaker evidence than three unrelated ones would be; the page reports the count and does not test the run.
        </p>
      </Method>
    </>
  )
}
