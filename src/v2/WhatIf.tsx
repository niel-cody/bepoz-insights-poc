import React, { useEffect, useMemo, useState } from 'react'
import { ALL, Bench, Dataset, compact, itemsPerTx, money, n0, n1, n2, pct, perPerson, perTx, perVisit } from '../lib'
import { Section } from '../components/ui'
import { Caveat, JudgedKpi, Standfirst } from '../components/v2ui'

const S: React.FC<{ label: string; hint?: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }> =
  ({ label, hint, value, min, max, step, fmt, onChange }) => (
    <div className="slider">
      <label>{label}{hint && <span className="shint">{hint}</span>}</label>
      <span className="val">{fmt(value)}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ ['--fill' as any]: ((value - min) / (max - min) * 100) + '%' }}
        onChange={e => onChange(+e.target.value)} />
    </div>
  )

const ROUNDINGS = [0, 0.1, 0.2, 0.5]

/**
 * v1's model could not be wrong in the direction that mattered: a 7% price rise
 * produced 7% more revenue with volume untouched. Shneiderman's finding was that
 * a model which cannot fail is not a model. Elasticity is now an explicit,
 * user-set input rather than a hidden constant of zero, and the output is called
 * a scenario rather than a forecast.
 *
 * Two levers the council found missing are added: discount, which is the largest
 * controllable cost in the dataset, and labour, which Mick Torrance called the
 * biggest lever he pulls blind.
 *
 * Closes VPC-FSR-005 and VPC-FSR-013.
 */
export default function WhatIfV2({
  ds, bench, venue, month, preload, onPreloadConsumed,
}: {
  ds: Dataset; bench: Bench; venue: string; month: string
  preload?: string | null; onPreloadConsumed?: () => void
}) {
  const base = bench.get(venue, ALL, month, 'all')

  const [priceRise, setPriceRise] = useState(0)
  const [elasticity, setElasticity] = useState(-0.6)   // never zero by default
  const [round, setRound] = useState(0)
  const [serviceFee, setServiceFee] = useState(0)
  const [discountCut, setDiscountCut] = useState(0)
  const [discountLeak, setDiscountLeak] = useState(35) // % of discounted trade assumed to walk
  const [labourPct, setLabourPct] = useState(28)
  const [labourChange, setLabourChange] = useState(0)
  const [itemsLever, setItemsLever] = useState(0)
  const [visitsLever, setVisitsLever] = useState(0)
  const [focusTag, setFocusTag] = useState<string | null>(null)

  // Arriving from "Model this" on the Promotions page.
  useEffect(() => {
    if (!preload) return
    setFocusTag(preload)
    setDiscountCut(50)
    onPreloadConsumed?.()
  }, [preload])

  const tag = useMemo(
    () => (focusTag ? ds.promoTag.find(t => t.v === venue && t.m === month && t.t === focusTag) : null),
    [ds, venue, month, focusTag]
  )
  const allDiscount = base.disc
  const targetDiscount = tag ? tag.disc : allDiscount
  const targetTx = tag ? tag.txs : (ds.promoImpacted.find(r => r.v === venue && r.m === month)?.txs ?? 0)

  const model = useMemo(() => {
    const avgItemPrice = base.items ? base.rev / base.items : 0
    let lifted = avgItemPrice * (1 + priceRise / 100)
    if (round > 0) lifted = Math.ceil(lifted / round) * round
    const effectiveRise = avgItemPrice ? lifted / avgItemPrice - 1 : 0

    // Elasticity: a price rise costs volume. e = -0.6 means a 10% rise loses 6%
    // of units. This is the assumption that lets the scenario be wrong.
    const volumeFromPrice = 1 + effectiveRise * elasticity

    // Cutting a discount recovers the give, but some of the discounted trade
    // does not show up at all without it.
    const cutShare = discountCut / 100
    const recovered = targetDiscount * cutShare
    const walkedTx = targetTx * cutShare * (discountLeak / 100)
    const lostRevenue = walkedTx * (base.tx ? base.rev / base.tx : 0)

    const fItems = 1 + itemsLever / 100
    const fVisits = 1 + visitsLever / 100

    const items = base.items * fItems * fVisits * volumeFromPrice
    const tx = base.tx * fVisits * volumeFromPrice - walkedTx
    const visits = base.vis * fVisits
    const menuRev = items * lifted
    const svcFee = menuRev * (serviceFee / 100)
    const guestPays = menuRev + svcFee + recovered - lostRevenue

    const baseLabour = base.rev * (labourPct / 100)
    const labour = baseLabour * (1 + labourChange / 100)
    const labourDelta = labour - baseLabour

    const net = guestPays - base.rev - labourDelta

    return {
      avgItemPrice, lifted, effectiveRise, volumeFromPrice, items, tx, visits,
      menuRev, svcFee, recovered, lostRevenue, walkedTx, guestPays,
      baseLabour, labour, labourDelta, net,
      priceContribution: base.items * (lifted - avgItemPrice) + svcFee,
      volumeContribution: menuRev - base.items * lifted,
      ppl: base.ppl,
    }
  }, [base, priceRise, elasticity, round, serviceFee, discountCut, discountLeak, labourPct, labourChange, itemsLever, visitsLever, targetDiscount, targetTx])

  const rows = [
    { label: 'Revenue', b: base.rev, m: model.guestPays, fmt: compact },
    { label: '$ per transaction', b: perTx(base), m: model.tx ? model.guestPays / model.tx : NaN, fmt: (v: number) => '$' + n2(v) },
    { label: '$ per visit', b: perVisit(base), m: model.visits ? model.guestPays / model.visits : NaN, fmt: (v: number) => '$' + n2(v) },
    { label: '$ per person', b: perPerson(base), m: model.ppl ? model.guestPays / model.ppl : NaN, fmt: (v: number) => '$' + n0(v) },
    { label: 'Transactions', b: base.tx, m: model.tx, fmt: n0 },
    { label: 'Items per transaction', b: itemsPerTx(base), m: model.tx ? model.items / model.tx : NaN, fmt: n2 },
    { label: 'Labour cost', b: model.baseLabour, m: model.labour, fmt: compact, invert: true },
  ]

  const reset = () => {
    setPriceRise(0); setElasticity(-0.6); setRound(0); setServiceFee(0)
    setDiscountCut(0); setDiscountLeak(35); setLabourChange(0); setItemsLever(0); setVisitsLever(0); setFocusTag(null)
  }

  return (
    <>
      <Standfirst
        question="What happens if we change something?"
        sub="A scenario, not a forecast. Every lever carries an assumption you can see and argue with, and the elasticity slider is what lets this be wrong."
      />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <JudgedKpi hero label="Net effect" value={compact(model.net)}
          foot={<>revenue change less the labour change</>} />
        <JudgedKpi label="Revenue" value={compact(model.guestPays)}
          foot={<>from {compact(base.rev)}, {pct(base.rev ? model.guestPays / base.rev - 1 : 0, 2)}</>} />
        <JudgedKpi label="Volume effect of price" value={pct(model.volumeFromPrice - 1, 2)}
          foot={<>at an elasticity of {n1(elasticity)}</>} />
        <JudgedKpi label="Discount recovered" value={compact(model.recovered - model.lostRevenue)}
          foot={model.lostRevenue > 0
            ? <>{compact(model.recovered)} recovered less {compact(model.lostRevenue)} that walks</>
            : 'no discount cut modelled'} />
      </div>

      <div className="frow" style={{ marginBottom: 14 }}>
        <div className="flabel">Presets</div>
        <button className="chip" onClick={reset}>Benchmark</button>
        <button className="chip" onClick={() => { reset(); setPriceRise(3); setRound(0.1); setItemsLever(2) }}>Modest price move</button>
        <button className="chip" onClick={() => { reset(); setDiscountCut(50); setDiscountLeak(35) }}>Halve the discount</button>
        <button className="chip" onClick={() => { reset(); setLabourChange(-8); setVisitsLever(-1) }}>Trim labour</button>
      </div>

      {tag && (
        <Caveat>
          Modelling <b>{tag.t}</b>, carried over from the Promotions page: {money(tag.disc)} given across {n0(tag.txs)} transactions
          at a {pct(tag.impRev + tag.disc ? tag.disc / (tag.impRev + tag.disc) : 0, 2)} effective rate.
          The discount lever below now applies to that mechanic alone rather than to all discounting.
          <button className="chip" style={{ marginLeft: 10 }} onClick={() => { setFocusTag(null); setDiscountCut(0) }}>Model all discounting instead</button>
        </Caveat>
      )}

      <div className="grid g2">
        <div>
          <Section title="Price" open>
            <S label="Price rise on menu items" value={priceRise} min={0} max={10} step={0.1} fmt={v => v.toFixed(1) + '%'} onChange={setPriceRise} />
            <div className="frow" style={{ margin: '10px 0 4px' }}>
              <div className="flabel">Round up to</div>
              {ROUNDINGS.map(r => <button key={r} className={'chip' + (round === r ? ' on' : '')} onClick={() => setRound(r)}>{r === 0 ? 'None' : (r * 100) + '¢'}</button>)}
            </div>
            <S label="Price elasticity of demand" hint="how much volume you lose per 1% of price"
              value={elasticity} min={-2} max={0} step={0.05} fmt={v => v.toFixed(2)} onChange={setElasticity} />
            <S label="Service fee on the transaction total" value={serviceFee} min={0} max={10} step={0.1} fmt={v => v.toFixed(1) + '%'} onChange={setServiceFee} />
            <div className="card-s" style={{ marginTop: 10 }}>
              Average item price moves <b>${n2(model.avgItemPrice)}</b> to <b>${n2(model.lifted)}</b>, an effective
              {' '}{pct(model.effectiveRise, 2)} after rounding, and volume responds by {pct(model.volumeFromPrice - 1, 2)}.
            </div>
          </Section>

          <Section title="Discount" open>
            <S label={tag ? `Cut ${tag.t} by` : 'Cut all discounting by'} value={discountCut} min={0} max={100} step={5} fmt={v => v + '%'} onChange={setDiscountCut} />
            <S label="Of the discounted trade you cut, how much walks?" hint="the honest unknown on this page"
              value={discountLeak} min={0} max={100} step={5} fmt={v => v + '%'} onChange={setDiscountLeak} />
            <div className="card-s" style={{ marginTop: 10 }}>
              Recovers <b>{compact(model.recovered)}</b> of give and loses <b>{n0(model.walkedTx)}</b> transactions
              worth <b>{compact(model.lostRevenue)}</b>. Net {compact(model.recovered - model.lostRevenue)}.
              Break-even walk rate is {pct(targetDiscount && targetTx ? targetDiscount / (targetTx * (base.tx ? base.rev / base.tx : 1)) : 0, 0)}.
            </div>
          </Section>

          <Section title="Labour">
            <S label="Labour as a share of revenue at benchmark" hint="set this from your own P&L" value={labourPct} min={15} max={45} step={0.5} fmt={v => v.toFixed(1) + '%'} onChange={setLabourPct} />
            <S label="Change in labour cost" value={labourChange} min={-25} max={25} step={1} fmt={v => (v >= 0 ? '+' : '') + v + '%'} onChange={setLabourChange} />
            <div className="card-s" style={{ marginTop: 10 }}>
              {compact(model.baseLabour)} becomes {compact(model.labour)}, a change of {compact(model.labourDelta)}.
              Labour is not in the warehouse, so this is entirely your assumption. It is here because cutting labour
              without a revenue consequence is the easiest way to build a scenario that flatters itself.
            </div>
          </Section>

          <Section title="Behaviour">
            <S label="Items per transaction" value={itemsLever} min={-10} max={15} step={0.5} fmt={v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'} onChange={setItemsLever} />
            <S label="Visits" value={visitsLever} min={-10} max={15} step={0.5} fmt={v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'} onChange={setVisitsLever} />
            <div className="card-s" style={{ marginTop: 10 }}>
              These compound with each other and with the price effect, so setting both to +5% gives
              slightly more than +10% on items.
            </div>
          </Section>
        </div>

        <div>
          <Section title="Benchmark against scenario" open>
            <div className="tw flat">
              <table>
                <thead><tr className="head"><th className="l">Measure</th><th>Benchmark</th><th>Scenario</th><th>Change</th></tr></thead>
                <tbody>
                  {rows.map(r => {
                    const d = r.m - r.b
                    const good = r.invert ? d < 0 : d > 0
                    return (
                      <tr key={r.label}>
                        <td className="l">{r.label}</td>
                        <td className="num">{r.fmt(r.b)}</td>
                        <td className="num" style={{ color: 'var(--text)' }}>{r.fmt(r.m)}</td>
                        <td className="num" style={{ color: Math.abs(d) < 1e-9 ? undefined : good ? 'var(--pos)' : 'var(--neg)' }}>
                          {isFinite(d) ? (d >= 0 ? '+' : '') + r.fmt(d) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="total">
                    <td className="l">Net effect</td><td className="num">$0</td>
                    <td className="num" style={{ color: model.net >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{compact(model.net)}</td>
                    <td className="num">{pct(base.rev ? model.net / base.rev : 0, 2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid g3" style={{ marginTop: 14 }}>
              <div className="kpi"><div className="kpi-l">From price</div><div className="kpi-v num">{compact(model.priceContribution)}</div><div className="kpi-d">price and service fee</div></div>
              <div className="kpi"><div className="kpi-l">From volume</div><div className="kpi-v num">{compact(model.volumeContribution)}</div><div className="kpi-d">behaviour and elasticity</div></div>
              <div className="kpi"><div className="kpi-l">From discount</div><div className="kpi-v num">{compact(model.recovered - model.lostRevenue)}</div><div className="kpi-d">recovered less walked</div></div>
            </div>
          </Section>

          <Section title="What would have to be true" open>
            <div className="reasoning">
              <p>For this scenario to hold, all of the following must be true at once. If any one is wrong, the net figure is wrong.</p>
              <ul>
                <li>Guests absorb a <b>{pct(model.effectiveRise, 2)}</b> price rise while losing only <b>{pct(Math.abs(model.volumeFromPrice - 1), 2)}</b> of volume. That is an elasticity of <b>{n1(elasticity)}</b>, which nobody at Feros has measured.</li>
                {discountCut > 0 && <li>Cutting {tag ? tag.t : 'discounting'} by <b>{discountCut}%</b> loses only <b>{discountLeak}%</b> of the trade it was attached to. Above <b>{pct(targetDiscount && targetTx ? targetDiscount / (targetTx * (base.tx ? base.rev / base.tx : 1)) : 0, 0)}</b> the cut destroys more than it recovers.</li>}
                {labourChange !== 0 && <li>Labour moves <b>{labourChange}%</b> without changing service enough to move revenue. The model does not link the two, so you are asserting it.</li>}
                {(itemsLever !== 0 || visitsLever !== 0) && <li>The behavioural levers happen at all. Nothing in the data says they will; they are hypotheses with a number attached.</li>}
                <li>Nothing else changes: no competitor move, no weather, no roster problem, no supplier increase.</li>
              </ul>
            </div>
          </Section>

          <Section title="Top products at the modelled price">
            <div className="tw" style={{ maxHeight: 340 }}>
              <table>
                <thead><tr className="head"><th className="l">Product</th><th>Qty</th><th>Now</th><th>Scenario</th><th>GP %</th></tr></thead>
                <tbody>
                  {ds.products.filter(p => p.v === venue).sort((a, b) => b.rev - a.rev).slice(0, 25).map(p => {
                    let np = p.price * (1 + priceRise / 100)
                    if (round > 0) np = Math.ceil(np / round) * round
                    return (
                      <tr key={p.n}>
                        <td className="l">{p.n}</td>
                        <td className="num">{n0(p.qty)}</td>
                        <td className="num">${n2(p.price)}</td>
                        <td className="num" style={{ color: np > p.price ? 'var(--pos)' : undefined }}>${n2(np)}</td>
                        <td className="num">{pct(p.rev ? (p.rev - p.cost) / p.rev : NaN, 1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>

      <Caveat>
        <b>This page is a scenario tool, not a forecast.</b> Elasticity, the walk rate and the labour ratio are
        assumptions you set, and the warehouse contains no evidence for any of the three. Merchant fees and
        subsidies were dropped from this version because Oolio billing is not in Snowflake either, and modelling
        a cost with no observed value was giving the output false authority.
      </Caveat>
    </>
  )
}
