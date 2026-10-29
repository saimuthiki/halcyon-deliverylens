# DeliveryLens demo film: plan

**Length:** 2:36 (156.5 s), 1920x1080, 30 fps, H.264 + AAC.
**Angle:** a short film about a decision. Halcyon is about to spend $680K on routing software. The data shows routing is not the main problem. DeliveryLens finds the real causes, fixes them in the real app, and proves the gain.

## How it was made
- **Real app only.** Every app shot is the running DeliveryLens app (local backend + frontend, real data, real AI calls with Gemini). It was recorded frame by frame with a deterministic headless Chrome, so the app's own animations play exactly as in the browser:
  - the How it works map;
  - the Order desk envelope;
  - the 08:00 clock;
  - the trip cards.

  The film adds only camera moves (zoom and pan), captions and title cards.
- **Numbers** all come from the repo: README, `docs/03-what-the-data-says.md`, `PROJECT-PROGRESS.md` and the app's own screens. Test counts were taken from `pytest --collect-only`, Vitest and the e2e specs on 29 Oct 2026.
- **Privacy:** sender names and email addresses in the sample emails are blurred. Client ids and carrier letters are shown.
- **Music:** an original score written in code (`work/music.py`), 96 BPM in D minor, moving to D major. Every cut lands on a bar line (2.5 s).

## Storyboard

| Time | Bars | Scene | On screen |
|---|---|---|---|
| 0:00–0:05 | 0–2 | Cold open | Night US map, a truck crossing the country. "48,340 deliveries. Every one is a promise." |
| 0:05–0:10 | 2–4 | The problem | 29 counts up; 29 of 100 dots turn orange. "of every 100 Halcyon deliveries arrive late." |
| 0:10–0:15 | 4–6 | The cost | $1.74M a year in penalties · 34 complaints, "Nobody told us." · 9 clients, $14.2M, ready to leave |
| 0:15–0:20 | 6–8 | The plan | "$680K for new routing software" slams in |
| 0:20–0:22 | 8 | The question | "But is the route really the problem?" (music holds its breath) |
| 0:22–0:25 | 9 | Investigation | "So we read every delivery." |
| 0:25–0:35 | 10–14 | Five causes | Five cards land on the beat with on-time % when each cause happens; route deviation is "the only one a routing tool fixes" |
| 0:35–0:42 | 14–17 | The options | Bars grow: today 71, routing only 80.2, 3 process fixes 86.7, all five 90.2, benchmark 94 |
| 0:42–0:47 | 17–19 | Reveal | Logo draws, "DeliveryLens: finds why, fixes each cause, proves the gain" (the drop) |
| 0:47–1:00 | 19–24 | How it works (real app) | The today-vs-DeliveryLens map: 1,700 miles vs 160, late vs on time |
| 1:00–1:20 | 24–32 | Order desk (real app) | Email → Run → envelope down the 10 steps (AI reads, rules decide) → Accepted with a better carrier → a person approves → WMS row |
| 1:20–1:30 | 32–36 | Missing postcode | Envelope stops (orange) at the address step; address found in history; the client's one-click page on the API → confirmed |
| 1:30–1:37 | 36–39 | Late same-day | The 08:00 clock; grace period = 729 fewer late deliveries a year |
| 1:37–1:42 | 39–41 | Stock & routes | The three trip cards |
| 1:42–1:47 | 41–43 | Morning risk board | Riskiest shipments at 08:00; backtest AUC 0.81 |
| 1:47–1:52 | 43–45 | Carrier penalties | $261,900 the carriers alone caused; AI drafts the claim |
| 1:52–1:57 | 45–47 | At-risk clients | A real AI save plan opens for Client 263 |
| 1:57–2:00 | 47 | Bad input | "What happens with bad input?" |
| 2:00–2:07 | 48–51 | Prompt injection | The email hides "Ignore all previous instructions…" → Blocked at the safety screen; nothing reaches the warehouse |
| 2:07–2:12 | 51–53 | Unclear order | "A couple of pallets of the usual" → Needs review by a person; no guessing |
| 2:12–2:20 | 53–56 | Go-live proof | 384 backend · 60 frontend · 18 browser tests; every push deploys to AWS; guardrails; Secrets Manager |
| 2:20–2:27 | 56–59 | The promise | "AI reads. Rules decide. A person approves." 71 → 90 on time; about $1.4M a year net, without the $680K tool |
| 2:27–2:36 | 59–62 | End card | Logo, Team InfinityStacks (Sravan Kumar D · Sai M · Dinesh K), EvoHack 2026 |

## Rebuild
From `demo-video/work/` (the local app must be running for `shoot.mjs`):

```bash
node shoot.mjs map desk hold client clock stock risk claims save inject vague   # real app clips
python music.py                                                                  # score -> music.wav
node render.mjs frames 0 4695                                                    # film frames
```

Then encode the film (poster baked in as frame 0):

```bash
ffmpeg -framerate 30 -i frames/f-%05d.jpg -i music.wav -map 0:v -map 1:a -t 156.5   -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart   -c:a aac -b:a 192k -af "afade=t=out:st=154.5:d=2" ../DeliveryLens-demo.mp4
```
