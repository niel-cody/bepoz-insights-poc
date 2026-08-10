import React, { useMemo, useState } from 'react'
import { ALL, Bench, Dataset, compact, itemsPerTx, money, n0, n1, n2, pct, perPerson, perTx, perVisit, txPerPerson, txPerVisit, visPerPerson } from '../lib'
import { Kpi, Note, Section } from '../components/ui'

const S: React.FC<{ label: string; value: number; min: number; max: number; step: number; unit?: string; fmt?: (v: number) => string; onChange: (v: number) => void }> =
  ({ label, value, min, max, step, unit = '', fmt, onChange }) => (
    <div className="slider">
      <label>{label}</label>
      <span className="val">{fmt ? fmt(value) : value + unit}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ ['--fill' as any]: ((value - min) / (max - min) * 100) + '%' }}
        onChange={e => onChange(+e.target.value)} />
    </div>
  )

const ROUNDINGS = [0, 0.1, 0.2, 0.5]

export default function WhatIf({ ds, bench, venue, month }: { ds: Dataset; bench: Bench; venue: string; month: string }) {
  const base = bench.get(venue, ALL, month, 'all')

  // ---- levers -------------------------------------------------------------
  const [priceRise, setPriceRise] = useState(0)      // % on item prices
  const [round, setRound] = useState(0)              // menu price rounding, up
  const [serviceFee, setServiceFee] = useState(0)    // % added on TX total
  const [cashDisc, setCashDisc] = useState(0)        // % off lifted price for cash
  const [cashRound, setCashRound] = useState(0)      // cash price rounding, down
  const [msfRate, setMsfRate] = useState(1.36)       // % of card volume
  const [msfCents, setMsfCents] = useState(0)        // cents per card TX
  const [surcharged, setSurcharged] = useState(true) // merchant passes MSF to guest
  const [termSub, setTermSub] = useState(100)        // % subsidised
  const [saasSub, setSaasSub] = useState(100)
  const [termCost, setTermCost] = useState(45)       // $/terminal/month, unsubsidised
  const [saasCost, setSaasCost] = useState(280)      // $/venue/month, unsubsidised
  const [itemsPerTxLever, setItemsPerTxLever] = useState(0)  // %
  const [txPerVisitLever, setTxPerVisitLever] = useState(0)  // %
  const [visitsPerPersonLever, setVisitsPerPersonLever] = useState(0) // %

  const months = month === ALL ? ds.months.length : 1
  const rcCount = venue === ALL ? ds.meta.revenueCentres : (ds.rcs[venue] || []).length
  const venueCount = venue === ALL ? ds.venues.length : 1

  // ---- modelled -----------------------------------------------------------
  const model = useMemo(() => {
    const cardShare = base.card + base.cash ? base.card / (base.card + base.cash) : 0.8
    const cashShare = 1 - cardShare

    // Price lever: rise, then round up to the nearest step, applied to the
    // average item price so the rounding effect scales with basket size.
    const avgItemPrice = base.items ? base.rev / base.items : 0
    let lifted = avgItemPrice * (1 + priceRise / 100)
    if (round > 0) lifted = Math.ceil(lifted / round) * round
    const priceFactor = avgItemPrice ? lifted / avgItemPrice : 1

    // Volume levers compound onto the base counts.
    const fIpt = 1 + itemsPerTxLever / 100
    const fTpv = 1 + txPerVisitLever / 100
    const fVpp = 1 + visitsPerPersonLever / 100

    const visits = base.vis * fVpp
    const tx = base.tx * fTpv * fVpp
    const items = base.items * fIpt * fTpv * fVpp
    const menuRev = items * lifted

    // Cash discount applies to the cash-tendered share of the lifted price.
    let cashPrice = lifted * (1 - cashDisc / 100)
    if (cashRound > 0) cashPrice = Math.floor(cashPrice / cashRound) * cashRound
    const cashGiveUp = cashShare * items * (lifted - cashPrice)

    const svcFee = menuRev * (serviceFee / 100)
    const guestPays = menuRev - cashGiveUp + svcFee

    // Merchant P&L
    const cardVolume = guestPays * cardShare
    const cardTx = tx * cardShare
    const msf = surcharged ? 0 : cardVolume * (msfRate / 100) + cardTx * (msfCents / 100)
    const msfIfNotSurcharged = cardVolume * (msfRate / 100) + cardTx * (msfCents / 100)
    const terminals = rcCount * termCost * months * (1 - termSub / 100)
    const saas = venueCount * saasCost * months * (1 - saasSub / 100)
    const merchantCost = msf + terminals + saas

    const priceUplift = base.items * (lifted - avgItemPrice) + svcFee
    const basketUplift = menuRev - base.items * lifted
    const netBenefit = (menuRev - cashGiveUp + svcFee) - base.rev - merchantCost

    return {
      lifted, avgItemPrice, priceFactor, visits, tx, items, menuRev, guestPays,
      cashGiveUp, svcFee, msf, msfIfNotSurcharged, terminals, saas, merchantCost,
      priceUplift, basketUplift, netBenefit, cardShare, cashShare, cashPrice,
      ppl: base.ppl,
    }
  }, [base, priceRise, round, serviceFee, cashDisc, cashRound, msfRate, msfCents, surcharged, termSub, saasSub, termCost, saasCost, itemsPerTxLever, txPerVisitLever, visitsPerPersonLever, months, rcCount, venueCount])

  const rows: { label: string; base: number; mod: number; fmt: (v: number) => string }[] = [
    { label: 'Menu revenue', base: base.rev, mod: model.guestPays, fmt: compact },
    { label: 'ATV ($ / TX)', base: perTx(base), mod: model.tx ? model.guestPays / model.tx : NaN, fmt: v => '$' + n2(v) },
    { label: '$ / visit', base: perVisit(base), mod: model.visits ? model.guestPays / model.visits : NaN, fmt: v => '$' + n2(v) },
    { label: '$ / person', base: perPerson(base), mod: model.ppl ? model.guestPays / model.ppl : NaN, fmt: v => '$' + n0(v) },
    { label: 'Items / TX', base: itemsPerTx(base), mod: model.tx ? model.items / model.tx : NaN, fmt: v => n2(v) },
    { label: 'TX / visit', base: txPerVisit(base), mod: model.visits ? model.tx / model.visits : NaN, fmt: v => n2(v) },
    { label: 'Visits / person', base: visPerPerson(base), mod: model.ppl ? model.visits / model.ppl : NaN, fmt: v => n2(v) },
    { label: 'TX / person', base: txPerPerson(base), mod: model.ppl ? model.tx / model.ppl : NaN, fmt: v => n2(v) },
  ]

  const products = useMemo(
    () => ds.products.filter(p => p.v === venue).sort((a, b) => b.rev - a.rev).slice(0, 40),
    [ds, venue]
  )

  const reset = () => {
    setPriceRise(0); setRound(0); setServiceFee(0); setCashDisc(0); setCashRound(0)
    setMsfRate(1.36); setMsfCents(0); setSurcharged(true); setTermSub(100); setSaasSub(100)
    setItemsPerTxLever(0); setTxPerVisitLever(0); setVisitsPerPersonLever(0)
  }
  const preset = (p: 'conservative' | 'balanced' | 'aggressive') => {
    reset()
    if (p === 'conservative') { setPriceRise(2); setRound(0.1); setItemsPerTxLever(1) }
    if (p === 'balanced') { setPriceRise(4); setRound(0.1); setServiceFee(1); setItemsPerTxLever(3); setTxPerVisitLever(1) }
    if (p === 'aggressive') { setPriceRise(7); setRound(0.5); setServiceFee(2.5); setCashDisc(3); setItemsPerTxLever(6); setTxPerVisitLever(3); setVisitsPerPersonLever(3); setSurcharged(false); setTermSub(50); setSaasSub(50) }
  }

  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        {rows.slice(0, 4).map(r => {
          const d = r.base ? (r.mod - r.base) / r.base : 0
          return (
            <Kpi key={r.label} label={r.label} value={r.fmt(r.mod)}
              detail={<>base {r.fmt(r.base)} · <b style={{ color: d > 0.0005 ? 'var(--pos)' : d < -0.0005 ? 'var(--neg)' : undefined }}>{d >= 0 ? '+' : ''}{pct(d, 2)}</b></>} />
          )
        })}
        <Kpi label="Net merchant benefit" value={compact(model.netBenefit)}
          detail={<>uplift less merchant cost</>} />
        <Kpi label="Merchant cost" value={compact(model.merchantCost)}
          detail={<>MSF {compact(model.msf)} · kit {compact(model.terminals + model.saas)}</>} />
      </div>

      <div className="frow" style={{ marginBottom: 14 }}>
        <div className="flabel">Presets</div>
        <button className="chip" onClick={reset}>Benchmark</button>
        <button className="chip" onClick={() => preset('conservative')}>Conservative</button>
        <button className="chip" onClick={() => preset('balanced')}>Balanced</button>
        <button className="chip" onClick={() => preset('aggressive')}>Aggressive</button>
      </div>

      <div className="grid g2">
        <div>
          <Section title="Price strategy" open>
            <S label="Price rise on menu items" value={priceRise} min={0} max={10} step={0.1} fmt={v => v.toFixed(1) + '%'} onChange={setPriceRise} />
            <div className="frow" style={{ margin: '10px 0 4px' }}>
              <div className="flabel">Round up to</div>
              {ROUNDINGS.map(r => <button key={r} className={'chip' + (round === r ? ' on' : '')} onClick={() => setRound(r)}>{r === 0 ? 'None' : (r * 100) + '¢'}</button>)}
            </div>
            <S label="Service fee on transaction total" value={serviceFee} min={0} max={10} step={0.1} fmt={v => v.toFixed(1) + '%'} onChange={setServiceFee} />
            <div className="card-s" style={{ marginTop: 10 }}>
              Average item price moves <b>${n2(model.avgItemPrice)} → ${n2(model.lifted)}</b> ({pct(model.priceFactor - 1, 2)}).
            </div>
          </Section>

          <Section title="Cash discounting">
            <S label="Cash discount off lifted price" value={cashDisc} min={0} max={10} step={0.1} fmt={v => v.toFixed(1) + '%'} onChange={setCashDisc} />
            <div className="frow" style={{ margin: '10px 0 4px' }}>
              <div className="flabel">Round down to</div>
              {ROUNDINGS.map(r => <button key={r} className={'chip' + (cashRound === r ? ' on' : '')} onClick={() => setCashRound(r)}>{r === 0 ? 'None' : (r * 100) + '¢'}</button>)}
            </div>
            <div className="card-s" style={{ marginTop: 10 }}>
              Cash is <b>{pct(model.cashShare, 1)}</b> of tender for this selection. Cash price ${n2(model.cashPrice)} vs card ${n2(model.lifted)} — costing <b>{compact(model.cashGiveUp)}</b>.
            </div>
          </Section>

          <Section title="Merchant service fees">
            <div className="frow" style={{ marginBottom: 8 }}>
              <div className="flabel">Surcharge</div>
              <button className={'chip' + (surcharged ? ' on' : '')} onClick={() => setSurcharged(true)}>Passed to guest</button>
              <button className={'chip' + (!surcharged ? ' on' : '')} onClick={() => setSurcharged(false)}>Absorbed by venue</button>
            </div>
            <S label="MSF rate on card volume" value={msfRate} min={0} max={3} step={0.01} fmt={v => v.toFixed(2) + '%'} onChange={setMsfRate} />
            <S label="MSF cents per card transaction" value={msfCents} min={0} max={50} step={1} fmt={v => v + '¢'} onChange={setMsfCents} />
            <div className="card-s" style={{ marginTop: 10 }}>
              Card is <b>{pct(model.cardShare, 1)}</b> of tender. At this rate the fee is <b>{compact(model.msfIfNotSurcharged)}</b> — currently {surcharged ? <b>recovered from guests</b> : <b>carried by the venue</b>}.
            </div>
          </Section>

          <Section title="Oolio incentives & subsidies">
            <S label="Payment terminal subsidy" value={termSub} min={0} max={100} step={5} fmt={v => v + '%'} onChange={setTermSub} />
            <S label="SaaS subsidy" value={saasSub} min={0} max={100} step={5} fmt={v => v + '%'} onChange={setSaasSub} />
            <S label="Terminal list price ($ / revenue centre / month)" value={termCost} min={0} max={150} step={5} fmt={v => '$' + v} onChange={setTermCost} />
            <S label="SaaS list price ($ / venue / month)" value={saasCost} min={0} max={1000} step={20} fmt={v => '$' + v} onChange={setSaasCost} />
            <div className="card-s" style={{ marginTop: 10 }}>
              Modelling <b>{rcCount}</b> revenue centres across <b>{venueCount}</b> venue{venueCount > 1 ? 's' : ''} for <b>{months}</b> month{months > 1 ? 's' : ''}.
            </div>
          </Section>

          <Section title="Behavioural levers">
            <S label="Items per transaction" value={itemsPerTxLever} min={-5} max={15} step={0.5} fmt={v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'} onChange={setItemsPerTxLever} />
            <S label="Transactions per visit" value={txPerVisitLever} min={-5} max={15} step={0.5} fmt={v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'} onChange={setTxPerVisitLever} />
            <S label="Visits per person" value={visitsPerPersonLever} min={-5} max={15} step={0.5} fmt={v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'} onChange={setVisitsPerPersonLever} />
          </Section>
        </div>

        <div>
          <Section title="Benchmark vs modelled" open>
            <div className="tw flat">
              <table>
                <thead><tr className="head"><th className="l">Metric</th><th>Benchmark</th><th>Modelled</th><th>Δ</th><th>Δ %</th></tr></thead>
                <tbody>
                  {rows.map(r => {
                    const d = r.mod - r.base
                    const dp = r.base ? d / r.base : 0
                    return (
                      <tr key={r.label}>
                        <td className="l">{r.label}</td>
                        <td className="num">{r.fmt(r.base)}</td>
                        <td className="num" style={{ color: 'var(--text)' }}>{r.fmt(r.mod)}</td>
                        <td className="num" style={{ color: d > 0 ? 'var(--pos)' : d < 0 ? 'var(--neg)' : undefined }}>{isFinite(d) ? (d >= 0 ? '+' : '') + r.fmt(d) : '—'}</td>
                        <td className="num" style={{ color: dp > 0.0005 ? 'var(--pos)' : dp < -0.0005 ? 'var(--neg)' : undefined }}>{(dp >= 0 ? '+' : '') + pct(dp, 2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Merchant P&L" open>
            <div className="tw flat">
              <table>
                <thead><tr className="head"><th className="l">Line</th><th>Benchmark</th><th>Modelled</th></tr></thead>
                <tbody>
                  <tr><td className="l">Merchant service fees</td><td className="num">$0</td><td className="num">{money(model.msf)}</td></tr>
                  <tr><td className="l">Payment terminals</td><td className="num">$0</td><td className="num">{money(model.terminals)}</td></tr>
                  <tr><td className="l">SaaS</td><td className="num">$0</td><td className="num">{money(model.saas)}</td></tr>
                  <tr className="total"><td className="l">Net merchant cost</td><td className="num">$0</td><td className="num">{money(model.merchantCost)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="grid g3" style={{ marginTop: 14 }}>
              <div className="kpi"><div className="kpi-l">Price-rise uplift</div><div className="kpi-v num">{compact(model.priceUplift)}</div><div className="kpi-d">price + service fee only</div></div>
              <div className="kpi"><div className="kpi-l">Basket uplift</div><div className="kpi-v num">{compact(model.basketUplift)}</div><div className="kpi-d">volume levers only</div></div>
              <div className="kpi"><div className="kpi-l">Cash discount cost</div><div className="kpi-v num">−{compact(model.cashGiveUp)}</div><div className="kpi-d">given back at the till</div></div>
              <div className="kpi"><div className="kpi-l">MSF saving</div><div className="kpi-v num">{compact(model.msfIfNotSurcharged - model.msf)}</div><div className="kpi-d">value of surcharging</div></div>
              <div className="kpi"><div className="kpi-l">Change in incentives</div><div className="kpi-v num">−{compact(model.terminals + model.saas)}</div><div className="kpi-d">subsidy withdrawn</div></div>
              <div className="kpi"><div className="kpi-l">Net merchant benefit</div>
                <div className="kpi-v num" style={{ color: model.netBenefit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{compact(model.netBenefit)}</div>
                <div className="kpi-d">all levers combined</div></div>
            </div>
          </Section>

          <Section title="Product price list" count={`top ${products.length} by revenue`}>
            <div className="tw" style={{ maxHeight: 420 }}>
              <table>
                <thead><tr className="head"><th className="l">Product</th><th className="l">Type</th><th>Qty</th><th>Revenue</th><th>Menu price</th><th>Modelled</th><th>GP %</th></tr></thead>
                <tbody>
                  {products.map(p => {
                    let np = p.price * (1 + priceRise / 100)
                    if (round > 0) np = Math.ceil(np / round) * round
                    const gp = p.rev ? (p.rev - p.cost) / p.rev : NaN
                    return (
                      <tr key={p.n}>
                        <td className="l">{p.n}</td>
                        <td className="l" style={{ color: 'var(--text-3)' }}>{p.t}</td>
                        <td className="num">{n0(p.qty)}</td>
                        <td className="num">{money(p.rev)}</td>
                        <td className="num">${n2(p.price)}</td>
                        <td className="num" style={{ color: np > p.price ? 'var(--pos)' : undefined }}>${n2(np)}</td>
                        <td className="num">{pct(gp, 1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>

      <Note title="Assumptions you should challenge">
        <ul>
          <li><b>Card and cash shares</b> come from actual tendered payments for the selected scope, so they move with the venue and month you pick.</li>
          <li><b>Price rounding compounds after the rise</b>, applied to the average item price — so a 2% rise rounded to 50¢ can move the effective lift well past 2%. Watch the "average item price moves" line.</li>
          <li><b>The behavioural levers are hypotheses, not forecasts.</b> They compound: visits per person lifts transactions, which lifts items. Nothing here models price elasticity — a price rise does not reduce volume in this model, which is deliberately optimistic.</li>
          <li><b>The merchant P&L is scenario-only.</b> Oolio billing was not available in Snowflake, so terminal and SaaS list prices are inputs you set, defaulted to plausible values. The MSF default of 1.36% is the blended rate used in the original review. Set them to your real contract before quoting any figure from this page.</li>
          <li><b>Benchmark merchant cost is shown as $0</b> because the group currently surcharges card fees and receives full terminal and SaaS subsidy. That is the reality this page models away from.</li>
        </ul>
      </Note>
    </>
  )
}
