# The Thinking edition — what it is and why each page exists

A third view in the Feros Strategic Review, alongside Classic and New. Built on New as
the template: same shell, same design system, same "a page opens with a question"
pattern. Same extract too — eleven venues, forty-four revenue centres, January to July
2026, 1.81M completed orders, $51.8M. No measure has been redefined and no row filtered.

Everything different about it is a different question asked of the same numbers.

---

## The problem it answers

Two problems, actually, and they turn out to be the same problem.

**The stated one.** On the New edition's Venues page every venue carries an index
against the group average, where 100 is average. But the eleven venues differ sevenfold
in revenue, from two revenue centres to eight, and from seven months of trading history
to three. There is no sense in which they share an average. That index is total revenue
divided by the mean of eleven totals, so it reproduces the revenue column's ordering
exactly — it tells you who is biggest, which everyone already knew — and the mean it
divides by sits above seven of the eleven venues, so most of the group is below 100 by
construction and the report reads as though most of the group is underperforming.

**The unstated one.** "Explain *why* something happened." The instinct behind that ask
is right and the usual objection to it is wrong. It is not that operators need to be
told what they cannot see. It is that the existing report cannot separate three things
that look identical on a percentage: a real change in trading, an artefact of the
calendar, and ordinary day-to-day noise. Until those are separated, no explanation is
possible — you are explaining a number that may not have moved.

Seeing Theory is the answer to both, and its transferable idea is a design pattern, not
a formula: **put the empirical and the theoretical on the same axes, and give the reader
the sample size.** That single move is what makes uncertainty legible to someone who has
never taken a statistics course, and it is what this edition is built on. Every page
carries a dial. Nothing about the trading changes when you move it; what changes is how
much evidence a claim needs, and watching a conclusion appear or disappear as you move
it is the fastest way anyone learns what a confidence level actually is.

---

## The six pages

### 1. Did anything happen?

Each venue's average trading day over a window, against its own average over the window
before, with the interval the evidence supports. Ranked by weight of evidence, not by
size of percentage. Three verdicts: **moved**, **within normal**, **not enough data**.

*The finding:* at a 30-day window and 95% confidence, **none of the eleven venues moved
by more than its own day-to-day variation already produces.** The New edition's "Losing
ground" and "Pulling ahead" panels were ranking noise, and a leaderboard built that way
will reshuffle every month while everyone explains the reshuffle. Drag the window to 84
days and two venues appear — Prince Kirrawee, up; and Potts Point Shop. That is the
whole lesson in one gesture: precision improves with the square root of the days, so
four times the data buys twice the precision, and a monthly report is usually too short
a window to see through.

Also on the page: **the smallest move you could detect** at the current window. That is
the number that converts "the report never tells me anything" from a complaint into an
arithmetic fact with a fix.

### 2. Normal days

A day judged against days like it — same venue, same weekday, recent — instead of
against a seven-day rolling average that has Saturday inside it. The range is a
*prediction* interval, the wider one, because operators need "where would tomorrow
land", not "where is the average".

*The findings:* the day of the week explains **87%** of daily revenue variance at group
level, which is why the raw daily line looks chaotic and why most "the day was down"
observations are the calendar. And the count of days outside the range is shown next to
the count the procedure produces on its own — at 95%, one day in twenty is outside by
construction. If the two numbers match, the "anomalies" are coincidences.

The page also does its own model checking, in public. The same days are judged three
ways — symmetric mean band, robust median band, multiplicative band on log revenue —
and the counts are compared against expectation. The symmetric bands miss in opposite
directions: the mean band is widened by the very big days it is meant to flag, and the
robust band is narrower than the data. The multiplicative one lands closest. That table
is what "check the model" looks like when it is on the surface rather than in a notebook.

### 3. Fair comparison

The answer to the index problem, in three parts.

**Where the group actually sits** — every venue on one axis with the mean and the median
marked, so the reader can see for themselves whether "versus average" means anything on
that measure. On revenue it does not. On revenue per visit it nearly does.

**The rank shuffle** — the index ordering against the ordering on a size-neutral
measure. The Wilton is eighth by revenue and first by revenue per visit; Helm Bar is
seventh and first on revenue per transaction. Those are venues the index was hiding.

**The interval on the estimate** — each rate bootstrapped over that venue's own trading
days, so where two bars overlap the page says the order between them is not something
this data can settle. Typically only three of ten adjacent pairs are genuinely separated;
the rest are ties being printed as a ranking.

The honest position it lands on: a venue can be compared with **itself over time**, with
**the group's common movement removed**, or on **a rate that does not contain its size**.
Not with the average.

### 4. Why it moved

The page the "explain why" brief was actually asking for, and it is arithmetic rather
than a model. A month-on-month change splits exactly into the part caused by the two
months containing different days, and the part caused by those days trading differently:

```
Δ = Σ (n₁ − n₀)·r₀   +   Σ n₁·(r₁ − r₀)
     calendar             trading
```

The two always sum back to the total. Nothing is fitted, so there is no coefficient to
argue about.

*The finding:* the group's **+$323k from June to July is +$420k of calendar and −$97k of
trading.** July had an extra Wednesday, Thursday and Friday and no public holiday, and a
Friday is worth roughly three Mondays. The group reported growth while trading backwards.
No percentage in either earlier edition could show that, and it is exactly the kind of
"why" that changes what a manager does on Monday.

Then the same change asked a second way — more people, or more spent each — and finally
what is left: the residual against each day's own weekday expectation, plotted against
the temperature and the rainfall it had. Weather accounts for about 3.5% of it. Stated
in bands rather than decimals, because one window of this size has not earned a decimal.

### 5. Members

The most quoted number in the review and the one with the most ways to be wrong.

*The strong claim:* members are ahead at **11 of 11 venues.** Under a null of no
systematic difference that is below a 1-in-1,000 coincidence, and it assumes nothing
about how spending is distributed.

*The weak claim:* the size. The per-venue gap runs from $2.32 to $76.44, and the headline
moves $3.00 depending only on whether you pool the venues, weight them by size, or count
each once — three defensible answers, and only one of them was ever printed. On top of
that, anonymous transactions cannot be joined into people, so the non-member visit count
over-counts and the gap is an upper bound. There is a dial for that assumption, because
nobody can currently test it and the page should say so rather than pick a number.

And the part no amount of statistics fixes: members chose to identify themselves, so
this describes two groups. It does not measure what membership *does*.

### 6. How this thinks

Half teaching device, half register.

The teaching device is the Seeing Theory pattern in its purest form, on Feros's own
data: draw *n* of a venue's real trading days at random, average, repeat fifteen hundred
times, and watch the histogram of those averages sit under the curve the arithmetic
predicts from nothing but the venue's own spread over the square root of *n*. Drag *n*.
At 28 days Berry Hotel's average trading day can only be pinned down to ±16%, which
means every percentage in this review smaller than that is inside its own measurement
error.

The register: the five house rules, the method provenance chapter by chapter, what was
tried and dropped, and what the edition still cannot do.

---

## The five rules

1. **Ship an estimate with its range, or ship nothing.** A number without a range cannot
   be acted on, because it cannot be wrong.
2. **Three states, never two.** Moved, within normal, not enough data. The third is a
   finding, not a gap.
3. **Never accept the null.** "Not detectable" is not "did not happen", and every page
   that says it also says how large a change would have had to be.
4. **A comparison is not a cause.**
5. **Name the comparison.** Its own past, its own weekday, its own resampled days. Never
   "the average", unless the average has been shown to mean something.

---

## Tried, and deliberately not shipped

- **Empirical-Bayes shrinkage.** The estimated prior weight comes out near zero: at
  Feros's transaction volumes the differences between venues are three orders of
  magnitude larger than the sampling error inside one, so shrinkage moves nothing. It is
  the right tool where a site can have twenty observations. Here it would have been
  decoration, and it is recorded on the page rather than quietly dropped.
- **p-values on the surface.** Misread by people who compute them for a living. The
  pages carry intervals and states; the p-value is underneath, deriving the state.
- **Same period last year.** The warehouse carries meaningful Feros trade from January
  2026 only.
- **A single health score per venue.** Composites hide the trade-off that made them and
  cannot be given an interpretable interval.

---

## What it still cannot do

- **It cannot tell you what caused anything.** Every split is an accounting identity and
  every comparison is between groups that formed themselves. The fix is not more
  statistics, it is design: ten per cent of a campaign audience held back for a week
  converts the promotions page from arithmetic into measurement.
- **It treats days as independent, and they are not.** A quiet week is one event, not
  seven, so the intervals are slightly narrower than the truth. Blocking the resample by
  week is the fix and it is a day of work.
- **It has no intraday grain.** Arrivals are a counting process; staffing to the average
  hour fails about one hour in fourteen by arithmetic alone. The heat map exists, the
  model on top of it does not.

---

## Where the code lives

| File | What it is |
| --- | --- |
| `src/stat.ts` | The whole statistical surface. Pure, deterministic, seeded. Student t from an incomplete beta so the arithmetic is inspectable, Welch's comparison, percentile bootstrap, exact decomposition, the same-weekday band in three shapes, pooled/stratified aggregation, power. |
| `src/think/data.ts` | Shared daily-grain preparation and window arithmetic. |
| `src/think/*.tsx` | The six pages. |
| `src/components/thinkui.tsx` | The vocabulary: estimate-and-interval rows, three-state verdicts, dials, and the two-column ledger stating what an earlier edition claimed against what the data carries. |

Every headline figure was independently recomputed in Python from the decrypted extract
before shipping, and matches to the last dollar.
