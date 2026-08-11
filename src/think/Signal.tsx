import React, { useMemo, useState } from 'react'
import { ALL, Dataset, compact, money, monthLabel, n0, n1, venueCode } from '../lib'
import { Standfirst } from '../components/v2ui'
import { Controls, Dial, EstimatePlot, EstimateRow, Finding, Ledger, Method, Stat, StatGrid, Switcher } from '../components/thinkui'
import { mde, mean, sd, signedMoney, signedPct, welch } from '../stat'
import { CONF_STEPS, anchorDate, days, revs, shortDate, windows } from './data'
import { Scope, isWholeGroup, periodLabel, scopeHistory, venuesOf } from './scope'

/**
 * Page one. The question every other page depends on: did anything actually
 * happen, or is this the same venue on a different set of days?
 *
 * The New edition ranked venues by month-on-month percentage change and called
 * the top four "Losing ground". That ranking is computed here too, alongside
 * the amount of movement each venue's own day-to-day variation produces for
 * free. On a one-month window the second number is larger than the first for
 * every venue in the group, which is the finding.
 */
export default function Signal({ ds, scope, onGo }: { ds: Dataset; scope: Scope; onGo: (tab: string, venue?: string) => void }) {
  const list = venuesOf(ds, scope)
  const [win, setWin] = useState(30)
  const [confIdx, setConfIdx] = useState(2)
  const conf = CONF_STEPS[confIdx]

  // Full history per venue: the period sets where the comparison ends, not how
  // far back it may look. Choosing July must not prevent July being compared
  // with June.
  const all = useMemo(() => {
    const m = new Map<string, ReturnType<typeof days>>()
    for (const v of list) m.set(v, days(ds, v))
    return m
  }, [ds, list])
  const groupSeries = useMemo(() => scopeHistory(ds, scope), [ds, scope])

  const anchor = useMemo(() => anchorDate(groupSeries, scope.period.to), [groupSeries, scope.period.to])

  const results = useMemo(() => {
    if (!anchor) return []
    return list.map(v => {
      const rows = all.get(v)!
      const w = windows(rows, anchor, win)
      const c = welch(revs(w.base), revs(w.now), conf, 8)
      const detectable = mde(sd(revs(w.base)), sd(revs(w.now)), w.base.length || 1, w.now.length || 1, conf)
      return { venue: v, ...w, c, detectable }
    }).filter(r => r.now.length > 0 || r.base.length > 0)
  }, [list, all, anchor, win, conf])

  const group = useMemo(() => {
    if (!anchor) return null
    const w = windows(groupSeries, anchor, win)
    return { ...w, c: welch(revs(w.base), revs(w.now), conf, 8) }
  }, [groupSeries, anchor, win, conf])

  const moved = results.filter(r => r.c.verdict === 'moved')
  const thin = results.filter(r => r.c.verdict === 'thin')
  const w0 = anchor ? windows(groupSeries, anchor, win) : null

  // The New edition's own ranking, recomputed, so the comparison is like for like.
  const byPct = [...results].filter(r => isFinite(r.c.rel)).sort((a, b) => a.c.rel - b.c.rel)
  const worst = byPct[0]
  const bestv = byPct[byPct.length - 1]

  const rows: EstimateRow[] = [...results]
    .sort((a, b) => (isFinite(b.c.t) ? Math.abs(b.c.t) : -1) - (isFinite(a.c.t) ? Math.abs(a.c.t) : -1))
    .map(r => ({
      key: r.venue,
      label: r.venue,
      sub: r.c.verdict === 'thin'
        ? `${r.now.length} of ${win} days traded`
        : `n ${r.base.length} → ${r.now.length}  ·  ${signedPct(r.c.rel)}`,
      point: r.c.diff, lo: r.c.lo, hi: r.c.hi,
      kind: r.c.verdict,
      value: signedMoney(r.c.diff),
      noIntervalNote: r.c.verdict === 'thin' ? 'too few trading days in this window to judge' : undefined,
      onClick: () => onGo('normal', r.venue),
    }))

  return (
    <>
      <Standfirst
        question="Did anything actually happen?"
        sub={anchor
          ? `Each venue's average trading day in the ${win} days to ${shortDate(anchor)}, against its own average over the ${win} days before that. The bar is the range of differences this venue's ordinary day-to-day variation would produce on its own.`
          : 'No trading days in the selected period.'}
      />

      <Controls note={
        <>Both dials change the evidence required, not the data. Widening the window shrinks every interval by roughly
        the square root of the extra days — four times the days for twice the precision — which is the entire economics
        of measurement, and the reason a monthly report can rarely tell you anything.</>
      }>
        <Dial label="Comparison window" value={win} min={14} max={90} step={7}
          display={win + ' days'} hint={w0 ? `${shortDate(w0.mid)} → ${shortDate(anchor!)} against ${shortDate(w0.from)} → ${shortDate(w0.mid)}` : ''}
          onChange={setWin} />
        <Switcher label="Confidence" value={String(confIdx)} onChange={k => setConfIdx(+k)}
          options={CONF_STEPS.map((c, i) => ({ k: String(i), label: Math.round(c * 100) + '%', title: `${Math.round((1 - c) * 100)}% of intervals built this way will miss` }))} />
      </Controls>

      <Finding tone={moved.length ? 'down' : 'flat'}>
        {moved.length === 0 ? (
          <>At a <b>{win}-day</b> window and <b>{Math.round(conf * 100)}%</b> confidence, <b>none</b> of the {results.length} venues
          moved by more than its own day-to-day variation already produces. That is not a quiet month. It is a window too short to see through.</>
        ) : (
          <><b>{moved.length}</b> of {results.length} venues moved by more than ordinary variation explains
          at a {win}-day window: {moved.map(m => m.venue).join(', ')}. The rest are inside their own noise.</>
        )}
        {thin.length > 0 && <> {thin.length} {thin.length === 1 ? 'venue has' : 'venues have'} too few trading days in this window to judge at all.</>}
      </Finding>

      <StatGrid>
        <Stat label={(isWholeGroup(ds, scope) ? 'Group' : 'Selection') + ' revenue, this window'} value={compact(w0 ? w0.now.reduce((a, d) => a + d.rev, 0) : NaN)}
          foot={group && group.c.verdict !== 'thin'
            ? <>average day {compact(group.c.b)}, {signedPct(group.c.rel)} on the window before</>
            : 'not enough days'} />
        <Stat label={'Is the ' + (isWholeGroup(ds, scope) ? "group's" : "selection's") + ' move real?'} tone={group?.c.verdict === 'moved' ? 'bad' : ''}
          value={group ? (group.c.verdict === 'moved' ? 'Yes' : group.c.verdict === 'thin' ? 'Unknown' : 'No') : '—'}
          foot={group && isFinite(group.c.t)
            ? <>difference {signedMoney(group.c.diff)} a day, interval {signedMoney(group.c.lo)} to {signedMoney(group.c.hi)}</>
            : '—'} />
        <Stat label="Smallest move you could detect" value={compact(mean(results.map(r => r.detectable).filter(isFinite)))}
          foot={<>per day, per venue, at 80% power. Anything smaller than this is invisible at this window, however confidently it is printed.</>} />
        <Stat label="Venues with a verdict" value={`${results.length - thin.length} of ${results.length}`}
          foot="the rest return “not enough data”, which is an answer" />
      </StatGrid>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">Change in the average trading day, with the range the evidence actually supports</div>
        <div className="card-s">
          Ordered by weight of evidence, not by size of the percentage. The dot is the estimate; the bar is the interval.
          A bar that crosses the centre line means the venue may not have moved at all. Click a venue to see its days.
        </div>
        <EstimatePlot rows={rows} fmt={signedMoney} zeroLabel="no change" />
      </div>

      {worst && bestv && (
        <Ledger
          where="the New edition"
          was={<>
            Ranked the same venues by month-on-month percentage and headed the panels
            “Losing ground” and “Pulling ahead”. On this window that reads
            <b> {worst.venue} {signedPct(worst.c.rel)}</b> at the bottom and
            <b> {bestv.venue} {signedPct(bestv.c.rel)}</b> at the top.
          </>}
          is={<>
            {worst.venue}'s interval runs {signedMoney(worst.c.lo)} to {signedMoney(worst.c.hi)} a day,
            and {bestv.venue}'s runs {signedMoney(bestv.c.lo)} to {signedMoney(bestv.c.hi)}. Both contain zero.
            The ordering is real; what it orders is the noise. A leaderboard built on it will reshuffle next month
            and every reshuffle will be explained.
          </>}
        />
      )}

      <Method formula={`difference   d  = mean(now) − mean(base)
standard error  se = √( s²_base/n_base + s²_now/n_now )
interval        d ± t(conf, ν)·se        ν by Welch–Satterthwaite
verdict         |d| > t·se  ⇒  moved,   otherwise within normal`}>
        <p>
          Each venue is compared only with itself, on adjacent windows of equal length, so nothing here depends on venues
          being the same size — which they are not, and which is exactly what breaks a comparison against a group average.
        </p>
        <p>
          Welch's form is used rather than the pooled one because venue variances differ by an order of magnitude across
          the group. Assuming equal variances would make every interval narrower than the data earns.
        </p>
        <p>
          <b>What this does not say.</b> "Within normal" is not "nothing happened". It means a change of this size cannot
          be told apart from ordinary variation at this window, and the third statistic above says how large a change
          would have had to be. Nothing here identifies a cause; two windows that differ are two windows that differ.
        </p>
      </Method>
    </>
  )
}
