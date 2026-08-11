import React, { useMemo, useState } from 'react'
import { ALL, Bench, Dataset, compact, money2, n0, n1, n2, pct, venueCode } from '../lib'
import { Standfirst } from '../components/v2ui'
import { Controls, Dial, EstimatePlot, EstimateRow, Finding, Ledger, Method, Stat, StatGrid, Switcher } from '../components/thinkui'
import { mean, poolVsStratify } from '../stat'
import { Scope, benchRange, isWholeGroup, periodLabel, venuesOf } from './scope'

/**
 * Page five. The members number is the most quoted figure in the whole review
 * and the one with the most ways to be wrong: it is pooled across eleven venues
 * of different member mix, it is measured on a denominator that over-counts on
 * one side only, and it is a comparison between two groups that selected
 * themselves. All three are recoverable — but only by saying them.
 */
export default function Members({ ds, bench, scope }: { ds: Dataset; bench: Bench; scope: Scope }) {
  const list = venuesOf(ds, scope)
  // Revenue centres land here and nowhere else: this is the only Thinking page
  // that reads the monthly cube rather than daily observations.
  const rcKeys = scope.rcs.length && list.length === 1 ? scope.rcs : [ALL]
  const [mode, setMode] = useState<'visit' | 'tx'>('visit')
  const [overcount, setOvercount] = useState(0)   // assumed over-count in anonymous visits, %

  const strata = useMemo(() => list.flatMap(v => rcKeys.map(rc => {
    const m = benchRange(ds, bench, v, rc, scope.period, 'member')
    const n = benchRange(ds, bench, v, rc, scope.period, 'nonmember')
    return {
      key: rc === ALL ? v : rc,
      aNum: m.rev, aDen: mode === 'visit' ? m.vis : m.tx,
      bNum: n.rev, bDen: (mode === 'visit' ? n.vis : n.tx) * (1 - overcount / 100),
    }
  })).filter(s => s.aDen > 0 && s.bDen > 0), [ds, bench, list, rcKeys, scope.period, mode, overcount])

  const r = useMemo(() => poolVsStratify(strata), [strata])
  const positive = r.gaps.filter(g => g.gap > 0).length
  const nG = r.gaps.length
  // Sign test: under "no systematic difference", each venue is a coin flip. All
  // eleven landing the same way is the evidence, and it needs no distribution.
  const signP = Math.pow(0.5, nG) * (positive === nG || positive === 0 ? 2 : 0)

  const rows: EstimateRow[] = [...r.gaps].sort((a, b) => b.gap - a.gap).map(g => ({
    key: g.key, label: g.key,
    sub: `${mode === 'visit' ? 'per visit' : 'per transaction'} · ${money2(g.a)} vs ${money2(g.b)}`,
    point: g.gap, lo: NaN, hi: NaN,
    kind: g.gap > 0 ? 'above' : 'below',
    verdictLabel: g.gap > 0 ? 'members ahead' : 'members behind',
    value: (g.gap > 0 ? '+' : '−') + '$' + Math.abs(g.gap).toFixed(2),
  }))

  // The same headline under two assumptions about the denominator, so the
  // fragility is a number on the page rather than a caveat in a footnote.
  const base = strata.map(x => ({ ...x, bDen: x.bDen / (1 - overcount / 100) }))
  const at0 = poolVsStratify(base).pooled
  const at20 = poolVsStratify(base.map(x => ({ ...x, bDen: x.bDen * 0.8 }))).pooled

  const unit = rcKeys[0] === ALL ? 'venue' : 'revenue centre'
  const spread = r.gaps.length ? Math.max(...r.gaps.map(g => g.gap)) - Math.min(...r.gaps.map(g => g.gap)) : NaN
  const choices = [
    { k: 'Pool every venue together', v: r.pooled, note: 'one big sum — the number the earlier editions print' },
    { k: 'Weight venues by their size', v: r.weighted, note: 'compare inside each venue first, then combine' },
    { k: 'Every venue counts once', v: r.equal, note: 'the typical venue, not the typical dollar' },
  ]
  const choiceSpread = Math.max(...choices.map(c => c.v)) - Math.min(...choices.map(c => c.v))

  return (
    <>
      <Standfirst
        question="Are members worth more — and how much of that are we entitled to claim?"
        sub={`The gap is real and it survives everything below. The size of it does not, and the difference between those two statements is the difference between a defensible number and a slide. ${periodLabel(ds, scope.period)}, ${nG} ${unit}${nG === 1 ? '' : 's'} in scope.`}
      />

      <Controls note={
        <>The over-count dial is a sensitivity test, not a correction. Anonymous transactions cannot be joined into
        people, so two visits by the same unidentified guest are counted as two guests. That inflates the non-member
        visit count and deflates their spend per visit, which inflates the gap. Nobody knows the true figure; the dial
        shows how much of the headline depends on it.</>
      }>
        <Switcher label="Measured per" value={mode} onChange={k => setMode(k as any)}
          options={[{ k: 'visit', label: 'Visit' }, { k: 'tx', label: 'Transaction' }]} />
        <Dial label="If anonymous visits over-count by" value={overcount} min={0} max={50} step={5}
          display={overcount + '%'} hint="how much of the gap is a measurement artefact" onChange={setOvercount} />
      </Controls>

      <Finding tone={nG < 3 ? 'flat' : positive === nG ? 'up' : 'flat'}>
        {nG < 3 ? (
          <>
            Members are {r.pooled >= 0 ? 'ahead by' : 'behind by'} <b>${Math.abs(r.pooled).toFixed(2)}</b> per
            {' '}{mode === 'visit' ? 'visit' : 'transaction'} across the {nG === 1 ? `single ${unit}` : `${nG} ${unit}s`} in scope.
            {' '}That is an arithmetic difference and nothing more. The evidence on this page is the <i>consistency</i> of the
            gap across independent {unit}s, and with {nG === 1 ? 'one' : 'two'} there is no consistency to test — a single
            comparison cannot tell a real difference from the composition of one room's trade. Widen the selection to put
            a claim behind it.
          </>
        ) : (
          <>
            Members spend more at <b>{positive} of {nG}</b> {unit}s
            {positive === nG && <> — every single one</>}.
            {' '}That consistency is the strong claim: under a null of no systematic difference the chance of all {nG} {unit}s
            landing the same way is <b>{signP < 0.001 ? 'below 1 in 1,000' : pct(signP, 2)}</b>, and it needs no assumption
            about how spending is distributed.
            {' '}The <i>size</i> is the weak claim: the per-{unit} gap runs from ${Math.min(...r.gaps.map(g => g.gap)).toFixed(2)} to
            {' '}${Math.max(...r.gaps.map(g => g.gap)).toFixed(2)}, a spread of ${spread.toFixed(2)}, and the headline moves
            ${choiceSpread.toFixed(2)} depending only on how they are combined.
          </>
        )}
      </Finding>

      <StatGrid>
        <Stat label="Pooled gap" value={'$' + r.pooled.toFixed(2)} foot={`member ${money2(r.pooledA)} vs non-member ${money2(r.pooledB)} per ${mode === 'visit' ? 'visit' : 'transaction'}`} />
        <Stat label={'Within-' + unit + ' gap'} value={'$' + r.weighted.toFixed(2)} foot={`the same ${unit}s, compared inside themselves first`} />
        <Stat label={unit[0].toUpperCase() + unit.slice(1) + 's where it reverses'} value={n0(r.reversals)} tone={r.reversals ? 'bad' : ''}
          foot={nG < 2 ? 'nothing to reverse against with one group in scope'
            : r.reversals ? 'the pooled figure has the sign wrong somewhere' : 'the direction is the same everywhere, so pooling does not flip it here'} />
        <Stat label="Gap if anonymous visits over-count 20%" value={'$' + at20.toFixed(2)}
          foot={<>against ${at0.toFixed(2)} with no adjustment — a ${(at0 - at20).toFixed(2)} swing from an assumption nobody can currently test</>} />
      </StatGrid>

      {nG > 1 && <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">The same data, three defensible answers</div>
        <div className="card-s">
          None of these is wrong. They answer different questions, and only one of them was ever printed.
        </div>
        <div className="wfall">
          {(() => {
            // Zoomed to the range the three answers occupy: on a zero-based axis
            // a $3 difference on a $33 number is invisible, and the whole point
            // of the panel is that the difference is not nothing.
            const lo = Math.min(...choices.map(c => c.v)), hi = Math.max(...choices.map(c => c.v))
            const pad = (hi - lo) * 0.6 + 0.2
            const at = (v: number) => ((v - (lo - pad)) / (hi - lo + pad * 2)) * 100
            return choices.map(c => (
              <div className="wrow" key={c.k}>
                <div className="wlab">{c.k}<span className="shint">{c.note}</span></div>
                <div className="wtrack"><i className="wbar up" style={{ left: 0, width: at(c.v) + '%' }} /></div>
                <div className="wval num">${c.v.toFixed(2)}</div>
              </div>
            ))
          })()}
        </div>
        <div className="chart-note">
          Pooling weights each venue by how much trade it does. Weighting inside venues asks what a member is worth
          <i> at their venue</i>. Counting venues equally asks what is true of a typical site. The gap between the top and
          the bottom of that list is ${choiceSpread.toFixed(2)}, produced entirely by a choice nobody was asked to make.
        </div>
      </div>}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-t">Every {unit}, on its own</div>
        <div className="card-s">
          The member minus non-member gap at each {unit}. This is the picture the pooled number replaces with one figure.
        </div>
        <EstimatePlot rows={rows} fmt={v => (v >= 0 ? '+$' : '−$') + Math.abs(v).toFixed(0)} zeroLabel="no gap" height={30} />
        <div className="chart-note">
          No intervals are drawn here, and that is not an omission. Member and non-member revenue is not carried at daily
          grain in this dataset, so there is nothing to resample. The evidence for the claim is the consistency across
          {' '}{nG} independent {unit}s, not a confidence interval on any one of them.
        </div>
      </div>

      <Ledger
        where="both earlier editions"
        was={<>Reported the member uplift as a single multiple of non-member value, pooled across all eleven venues.</>}
        is={<>
          Three things have to travel with that number or it should not travel at all:
          {nG > 1
            ? <> it is pooled, and pooling is a weighting choice worth ${choiceSpread.toFixed(2)} at this selection;</>
            : <> it rests on one group, so the consistency that makes the claim defensible is absent;</>}
          {' '}the non-member denominator over-counts, so the gap is an upper bound; and members chose to become members,
          so this is a description of two groups, not a measurement of what membership does.
        </>}
      />

      <Method formula={`pooled       Σ member revenue / Σ member ${mode === 'visit' ? 'visits' : 'transactions'}  −  same for non-members
within       Σ_v w_v · (member rate_v − non-member rate_v) / Σ_v w_v
equal        mean over venues of (member rate_v − non-member rate_v)
sign test    P(all ${nG} venues agree | no systematic difference) = 2 · (1/2)^${nG}`}>
        <p>
          The three aggregations differ whenever member penetration varies with venue size, which it does here — from
          {' '}{pct(Math.min(...list.map(v => { const m = benchRange(ds, bench, v, ALL, scope.period, 'member'); const n = benchRange(ds, bench, v, ALL, scope.period, 'nonmember'); return m.vis + n.vis ? m.vis / (m.vis + n.vis) : 1 })), 0)} to
          {' '}{pct(Math.max(...list.map(v => { const m = benchRange(ds, bench, v, ALL, scope.period, 'member'); const n = benchRange(ds, bench, v, ALL, scope.period, 'nonmember'); return m.vis + n.vis ? m.vis / (m.vis + n.vis) : 0 })), 0)} of visits.
          When a difference holds inside every group but the pooled figure disagrees with it, the pooled figure is the one
          that is wrong; here it does not reverse, but it is still ${Math.abs(r.pooled - r.weighted).toFixed(2)} away from
          the within-venue answer.
        </p>
        <p>
          The sign test is used because it assumes almost nothing: not normality, not equal variances, not even that the
          venues are comparable. It only asks whether eleven independent sites agreeing on direction is a surprise.
        </p>
        <p>
          <b>What this does not say.</b> Nothing on this page is causal. Members identify themselves, and the people who
          do that are the people who come often and spend more — which is the same fact stated twice, not evidence that
          the programme created the spend. Measuring what membership <i>does</i> needs a holdout or a matched design, and
          neither exists in this data. The honest product move is to say so on the surface rather than to keep printing a
          multiple.
        </p>
      </Method>
    </>
  )
}
