# /brag plan: Halcyon DeliveryLens

## What it is
DeliveryLens finds *why* Halcyon Logistics' deliveries are late (71% on time across 48,340 deliveries), fixes each cause with AI agents and simple rules, and proves the gain, before leadership signs a $680K routing-software contract that targets the wrong problem.

- **For:** Halcyon's operations leaders and customer-success team.
- **Sets it apart:** it argues *against* the obvious purchase with the company's own data, then runs the fix live: a client email goes in, a checked warehouse order comes out.
- **Best claim:** five causes explain 28 of the 29 points lost; the realistic plan reaches ~90% on time and nets ~$1.4M a year, without the $680K tool.
- **Visual hook:** a big orange "$680K" price tag, about to be spent on the wrong fix.
- **Share caption:** "Halcyon was about to spend $680K on routing software. DeliveryLens showed why deliveries are really late."

## Angle
"Don't buy the $680K fix." A decision story: the obvious purchase, the data that reframes it, the working fix, the payoff.

## Tone
`default` leaning `polished`: confident and clean, light on jokes. The humour is the premise: $680K aimed at the wrong problem.

## Visual identity (from `frontend/tailwind.config.js`, `index.css`, `public/favicon.svg`)
- Font: **Barlow** 400–800 (the app's own `@fontsource/barlow` files)
- Paper `#F3F5F4`, surface `#FFFFFF`, ink `#15212B`, ink-soft `#3A4852`, slate `#5E6B75`, line `#D9DFDD`
- Route teal `#0E6B63` (rules, fixes), late orange `#A84F0B` (today, problems), AI purple `#5B47B0`
- The app's logo mark (dark tile, orange-to-teal route line)

## Real material reused
- Live trace-step cards captured from the running Order desk (email M01, processed live with Gemini): steps 3–10, `work/ui/step-*.png`. Step 1 (sender name) is left out.
- The cause waterfall is rebuilt with the app's exact numbers and colours (71.0, +7.7, +6.9, +5.4, +4.9, +3.1, benchmark 94%, ceiling 99.0%), because the live chart captured blank. Bars grow on the beat.
- The carrier decision uses the live step's real data: Carrier F $10.50, 56% on time, weak lane → Carrier E $12.00, 77%.
- No personal data: only client IDs and carrier letters appear. Sample sender names are not shown.

## Music
120 BPM (1 beat = 0.5s, 1 bar = 2s), D major, progression D–A–Bm–G. Kick on every beat, clap on beats 2 and 4, 8th-note hats and bass, soft pad, plucked arpeggio. Effects (soft whooshes on cuts, quiet in-key ticks as cards land) sit on the same grid. Every cut lands on a beat.

## Storyboard (21.0 s, 42 beats)

| # | Time | Beats | Scene | On screen |
|---|---|---|---|---|
| 1 | 0.0–3.5 | 0–7 | **Hook** | Huge orange **$680K** slams in on beat 0. Under it: "on routing software, to fix late deliveries." The price tag tilts like a sticker. |
| 2 | 3.5–6.0 | 7–12 | **Reveal** | Logo mark draws its route line; "DeliveryLens" + "found the real problem first." |
| 3 | 6.0–10.0 | 12–20 | **Highlight 1: why late** | "Five causes. 28 of the 29 points lost." Waterfall: orange "Today 71%" bar, then one teal cause bar per beat with its label, benchmark 94% dashed line. |
| 4 | 10.0–14.5 | 20–29 | **Highlight 2: Order desk** | Left: "Client email in. Warehouse order out." / "AI reads it. Rules decide." Right: real trace cards land one per beat (AI purple, rule teal, data blue). |
| 5 | 14.5–17.5 | 29–35 | **Highlight 3: carrier** | Two cards: Spreadsheet pick, Carrier F, $10.50, **56%** on time, weak lane (struck out) → Advisor pick, Carrier E, $12.00, **77%**. "+$1.50 a shipment. +21 points on time." |
| 6 | 17.5–21.0 | 35–42 | **Punchline** | Counter 71% → **90%** on time. "~$1.4M a year. No $680K tool." Sign-off: logo, DeliveryLens · Team InfinityStacks · EvoHack 2026. |

Transitions: dip through paper (old content out, new content in), never a crossfade between two busy layouts.
