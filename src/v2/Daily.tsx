import React, { useMemo, useState } from 'react'
import {
  ALL, DailyPoint, Dataset, compact, dailySeries, delta, dowName, monthLabel, money, n0, n1, pct, weatherProvenance,
} from '../lib'
import { Caveat, DeltaTag, JudgedKpi, Standfirst } from '../components/v2ui'

/**
 * The daily view. Three operator personas independently asked for a day, and
 * v1 had no daily grain at all. It is also the only honest home for weather and
 * holidays, which are daily phenomena: overlaying them on a monthly bar would
 * average away the exact variance they are meant to explain.
 *
 * Treatment follows the Oolio Insights UX brief:
 *   principle 6  weather and holidays are context, not conclusions
 *   holidays     vertical bands, because a holiday changes the whole trading day
 *   weather      a recessive row above the axis, never a plotted series
 *   principle 9  degrade gracefully and say so, never a confident chart on a gap
 *
 * Closes VPC-FSR-003, 006, 007.
 */

const W = 1120, H = 300, PADL = 62, PADR = 14, PADT = 16, PADB = 54

export default function Daily({ ds, venue, month }: { ds: Dataset; venue: string; month: string }) {
  const [dimExtreme, setDimExtreme] = useState(false)
  const [hideHolidays, setHideHolidays] = useState(false)
  const [hover, setHover] = useState<DailyPoint | null>(null)

  const all = useMemo(() => dailySeries(ds, venue, month), [ds, venue, month])
  const series = useMemo(() => (hideHolidays ? all.filter(d => !d.holiday) : all), [all, hideHolidays])
  const wx = weatherProvenance(ds, venue)

  const max = Math.max(1, ...series.map(d => d.rev))
  const total = series.reduce((a, d) => a + d.rev, 0)
  const avg = series.length ? total / series.length : 0
  const holidays = all.filter(d => d.holiday)

  // Holiday lift is the kind of thing the app previously could not say at all.
  const holAvg = holidays.length ? holidays.reduce((a, d) => a + d.rev, 0) / holidays.length : NaN
  const ordinaryAvg = (() => {
    const o = all.filter(d => !d.holiday)
    return o.length ? o.reduce((a, d) => a + d.rev, 0) / o.length : NaN
  })()

  // Weather coverage, stated rather than assumed.
  const withWx = all.filter(d => d.tmax != null).length
  const coverage = all.length ? withWx / all.length : 0

  // Wet is the 80th percentile of rainfall across days that had any, so
  // "wet" means wet for this location rather than an invented threshold.
  const rain = all.map(d => d.mm ?? 0).filter(v => v > 0).sort((a, b) => a - b)
  const wetAt = rain.length ? rain[Math.floor(rain.length * 0.8)] : Infinity
  const wetDays = all.filter(d => (d.mm ?? 0) >= wetAt && d.mm != null)
  const dryDays = all.filter(d => d.mm != null && (d.mm ?? 0) < wetAt)
  const wetAvg = wetDays.length ? wetDays.reduce((a, d) => a + d.rev, 0) / wetDays.length : NaN
  const dryAvg = dryDays.length ? dryDays.reduce((a, d) => a + d.rev, 0) / dryDays.length : NaN

  const x = (i: number) => PADL + (i / Math.max(1, series.length - 1)) * (W - PADL - PADR)
  const y = (v: number) => PADT + (1 - v / max) * (H - PADT - PADB)
  const band = (W - PADL - PADR) / Math.max(1, series.length)

  const line = series.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.rev).toFixed(1)}`).join(' ')
  const roll = series.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.roll7).toFixed(1)}`).join(' ')

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  const isExtreme = (d: DailyPoint) => d.mm != null && d.mm >= wetAt

  return (
    <>
      <Standfirst
        question={venue === ALL ? 'How did each day actually trade?' : `How did ${venue} trade, day by day?`}
        sub="Daily revenue with a seven-day average. Public holidays are banded, weather sits above the axis as context. Neither explains a number on its own."
      />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <JudgedKpi hero label="Average day" value={compact(avg)}
          foot={<>{n0(series.length)} trading days{hideHolidays ? ', holidays excluded' : ''}</>} />
        <JudgedKpi label="Best day" value={compact(max)}
          foot={series.length ? series.reduce((a, d) => (d.rev > a.rev ? d : a), series[0]).label : '—'} />
        <JudgedKpi label="Public holidays" value={String(holidays.length)}
          delta={isFinite(holAvg) && isFinite(ordinaryAvg) ? delta(holAvg, ordinaryAvg) : undefined}
          deltaLabel="vs an ordinary day"
          foot={holidays.length ? holidays.map(h => h.holiday).join(', ') : 'none in this period'} />
        <JudgedKpi label="Wet days" value={wetDays.length ? String(wetDays.length) : '—'}
          delta={isFinite(wetAvg) && isFinite(dryAvg) ? delta(wetAvg, dryAvg) : undefined}
          deltaLabel="vs a dry day"
          foot={rain.length ? <>wet means over {n1(wetAt)}mm here</> : 'no rainfall data'} />
      </div>

      <div className="card">
        <div className="card-h">
          <div className="card-t">Revenue by day</div>
          <div style={{ flex: 1 }} />
          <button className={'chip' + (hideHolidays ? ' on' : '')} onClick={() => setHideHolidays(v => !v)}>
            Exclude holidays
          </button>
          <button className={'chip' + (dimExtreme ? ' on' : '')} onClick={() => setDimExtreme(v => !v)}
            disabled={!rain.length}>
            Dim wet days
          </button>
        </div>

        <div style={{ position: 'relative', overflowX: 'auto' }}>
          <svg width={W} height={H} className="daily" onMouseLeave={() => setHover(null)}>
            {/* holiday bands sit behind the data, never on top of it */}
            {(() => {
              // Four holidays fall inside five days at Easter, so labels are
              // staggered across two rows and dropped entirely when even that
              // would overlap. The band always renders; only the text yields.
              let lastX = -Infinity, row = 0
              return series.map((d, i) => {
                if (!d.holiday) return null
                const px = x(i)
                let label: React.ReactNode = null
                if (px - lastX > 34) { row = 0; lastX = px } else if (px - lastX > 12) { row = 1; lastX = px } else { row = -1 }
                if (row >= 0) {
                  label = (
                    <text x={px} y={PADT - 4 - row * 11} className="hollabel" textAnchor="middle">{d.holiday}</text>
                  )
                }
                return (
                  <g key={'h' + d.d}>
                    <rect x={px - band / 2} y={PADT} width={band} height={H - PADT - PADB} className="holband" />
                    {label}
                  </g>
                )
              })
            })()}

            {ticks.map(t => (
              <g key={t}>
                <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} className="grid" />
                <text x={PADL - 8} y={y(t) + 3.5} textAnchor="end" className="axis">{compact(t)}</text>
              </g>
            ))}

            {dimExtreme && series.map((d, i) => isExtreme(d) && (
              <rect key={'w' + d.d} x={x(i) - band / 2} y={PADT} width={band} height={H - PADT - PADB} className="wetband" />
            ))}

            <path d={line} className="dayline" />
            <path d={roll} className="rollline" />

            {series.map((d, i) => (
              <g key={d.d}>
                {hover?.d === d.d && <line x1={x(i)} y1={PADT} x2={x(i)} y2={H - PADB} className="crosshair" />}
                <circle cx={x(i)} cy={y(d.rev)} r={hover?.d === d.d ? 4 : 0} className="daydot" />
                <rect x={x(i) - band / 2} y={PADT} width={band} height={H - PADT - PADB}
                  fill="transparent" onMouseEnter={() => setHover(d)} />
              </g>
            ))}

            {/* weather as recessive chrome under the axis, never a series */}
            {series.map((d, i) => (i % Math.ceil(series.length / 26) === 0) && (
              <g key={'x' + d.d}>
                <text x={x(i)} y={H - PADB + 16} textAnchor="middle" className="axis">{d.label}</text>
                {d.tmax != null && (
                  <text x={x(i)} y={H - PADB + 32} textAnchor="middle" className="wxtext">
                    {Math.round(d.tmax)}°{(d.mm ?? 0) >= wetAt ? ' ▮' : ''}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {hover && (
            <div className="tt daily-tt" style={{ left: Math.min(x(series.indexOf(hover)) + 12, W - 220) }}>
              <div style={{ fontWeight: 620, marginBottom: 4 }}>
                {dowName(hover.dow)} {hover.label}{hover.holiday ? ` · ${hover.holiday}` : ''}
              </div>
              <div className="num">{money(hover.rev)} · {n0(hover.tx)} TX · {n0(hover.vis)} visits</div>
              <div className="num" style={{ color: 'var(--text-3)' }}>7-day average {compact(hover.roll7)}</div>
              {hover.tmax != null
                ? <div className="num" style={{ color: 'var(--text-3)' }}>{n1(hover.tmax)}°C max · {n1(hover.mm ?? 0)}mm rain</div>
                : <div style={{ color: 'var(--text-3)' }}>no weather for this day</div>}
            </div>
          )}
        </div>

        <div className="legend">
          <span><i style={{ background: 'var(--accent)' }} />Daily revenue</span>
          <span><i style={{ background: 'var(--s2)' }} />7-day average</span>
          <span><i style={{ background: 'rgba(240,166,60,.30)' }} />Public holiday</span>
          {rain.length > 0 && <span><i style={{ background: 'rgba(90,169,255,.16)' }} />Wet day, over {n1(wetAt)}mm</span>}
        </div>
      </div>

      {wx && (
        <Caveat>
          <b>Where the weather comes from.</b> Feros venues do not carry their own weather feed, so each venue borrows
          the nearest store that does. {venue === ALL
            ? <>This is the whole group, which spans {n1(wx.spread)}km from the Shire to the South Coast, so no single
                reading is right for all of it. The view uses <b>{wx.proxy}</b>, the station serving {wx.servesVenues} of
                the eleven venues. Pick a single venue for a local reading.</>
            : <><b>{venue}</b> is matched to <b>{wx.proxy}</b>, <b>{n1(wx.km)}km</b> away.</>}
          {!wx.group && wx.km > 15 && <> That is far enough that the reading is regional rather than local, and it should be treated as a hint about the day, not a measurement at the door.</>}
          {!wx.locationConfirmed && <> This venue's exact location is unconfirmed, so the match is provisional and worth correcting.</>}
          {' '}Coverage is {pct(coverage, 0)} of days in view; the feed stops at {wx.endsAt}, so any day after that shows no weather rather than a guess.
        </Caveat>
      )}
    </>
  )
}
