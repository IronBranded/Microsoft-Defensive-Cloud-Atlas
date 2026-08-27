# Executive Brief: Microsoft 365 Licensing Gaps — for the Atlas

A bilingual (EN/FR), MITRE ATT&CK-prioritized "Executive Brief," generated
**on the fly, inside** [IronBranded/Microsoft-Defensive-Cloud-Atlas](https://github.com/IronBranded/Microsoft-Defensive-Cloud-Atlas)'s
own `index.html` — no second `.html` file to host or keep in sync, matching
the Atlas's own single-self-contained-file premise instead of quietly
working around it.

## The workflow this is built for

```
 ┌──────────────────────────────────────────────────────────────┐
 │  index.html (Atlas) — one file, everything inlined:           │
 │  its own UI + this tool's engine, data, and both renderers    │
 │  (build/build-atlas-bundle.js produces the paste-ready block) │
 └──────────────────────────┬──────────────────────────────────┘
                             │ button click → openExecutiveBrief(ids, lang)
                             │ reads the CURRENT license-scope selection,
                             │ computes a model, builds an HTML string,
                             │ opens it via a Blob URL — no navigation,
                             │ no second file on disk
                             ▼
 ┌───────────────────────────────────────────────────────────────────┐
 │  a new tab: "Executive Brief: Microsoft 365 Licensing Gaps" ·       │
 │  light, document-style theme · not the Atlas SPA · EN/FR toggle ·   │
 │  dynamic per selected license scope, including any add-on combo    │
 └───────────────────────────────────────────────────────────────────┘
```

The Atlas's own UI stays exactly what it is: interactive, dark-themed. What
opens in the new tab has its own distinct visual identity — same "meant to
be read and forwarded like a report" reasoning as before — but it's
*synthesized at click-time* by code already living inside index.html, not a
separate file the tab navigates to. It's not gated behind actually pressing
Print: the button reads the current license-scope selection, which is
exactly what Print would render if pressed right now, so requiring an extra
printing step first would add friction without adding any real integrity
check.

An earlier revision of this tool *did* ship as a second file
(`executive-brief.html`, opened via a `?scope=` URL param) — see "No
separate file" below for why that changed and what's kept from it.

## Layout

```
data/            single source of truth — no prose lives here except bilingual labels
  licenses.json          license catalog + bundle "includes" graph
  sources.example.json   log-source knowledge base — SEE "What still needs you" below
  mitre-mapping.json     MITRE ATT&CK technique → tactic mapping, verified individually
  tactic-groups.json     groups tactics into the report's 4 narrative sections (A–D)
  risk-narratives.json   rule-based "Top 3 Strategic Risks" candidates, scored at render time
  products.json          fine-grained product catalog (mde/mdi/mdca/mdo/mdfc, 8 Purview
                          products); posture rows are computed from this, not category alone
  ransomware-chain.json  the 6-stage ransomware kill chain, each stage mapped to techniques

i18n/en.json, i18n/fr.json   every UI/narrative string; identical key sets enforced
                             by src/i18n.js#diffCatalogs

theme/report-light.css   the standalone report's visual identity — swap this file
                         alone to reskin; nothing else needs to change

src/
  report-engine.js         pure computation: (sources, licenses, selected scope) → report
                            MODEL. No DOM, no strings, no language, no theme. Runs in Node
                            or a browser.
  render-report.js         MODEL + language → HTML string for the brief's #sheet content.
  render-brief-document.js MODEL + language → a COMPLETE HTML document (adds the page shell:
                            control bar, print/lang-toggle wiring). This is what
                            openExecutiveBrief() calls to build a document in memory —
                            no separate file, see "No separate file" below.
  render-docx.js           MODEL + language → .docx (Node-only, optional companion export;
                            same model as render-report.js — one source of truth, many outputs).
  i18n.js                  key lookup, {placeholder} interpolation, EN/FR key-parity validator.

build/
  build-atlas-bundle.js    THE production build: concatenates data + engine + both renderer
                            layers into dist/atlas-inline-bundle.js, ready to paste into
                            index.html's <script> block.
  verify-inline-bundle.js  Playwright test simulating index.html with the bundle inlined:
                            clicks a button, captures the popup window it opens, confirms
                            it's a blob: URL (no file navigation) and renders correctly.
  build-report-page.js     DEV/PREVIEW tool only — builds dist/executive-brief.html, a
                            fully self-contained page for previewing without wiring up the
                            real Atlas. Not what ships. See its file header.
  verify-report-page.js    Playwright smoke test for the dev-preview page above.

integration/
  atlas-handoff-snippet.html   the ONE small addition to index.html — a button calling
                                openExecutiveBrief(), plus where to paste the built bundle.
```

## No separate file: generating the Brief inline

Earlier revisions of this tool shipped `executive-brief.html` as its own
file, opened via a `?scope=` URL the Atlas would hand off to. That worked,
but sat oddly next to the Atlas's own stated premise — *"one self-contained
HTML file... no server required, no installation"* — since it meant two
files had to exist and be deployed together.

`build/build-atlas-bundle.js` resolves this: it inlines the full engine,
every data file, and both rendering layers (`render-report.js` for the
brief's content, `render-brief-document.js` for the page shell around it)
into one pasteable block for index.html. The button
(`integration/atlas-handoff-snippet.html`) calls a single function,
`openExecutiveBrief(selectedLicenseIds, lang)`, which:

1. Computes a report model from the *current* selection using
   `AtlasReportEngine` — already running in index.html, nothing to fetch.
2. Builds a complete HTML document string via `AtlasBriefDocument.buildBriefDocument()`.
3. Opens it in a new tab via a Blob URL (`AtlasBriefDocument.openBriefDocument()`)
   — no `window.open("some-file.html")`, no second file to exist on disk.

The generated tab still looks nothing like the Atlas — `theme/report-light.css`
is inlined into the bundle and travels with every generated document — the
distinct visual identity was never about being a separate *file*, just about
not being styled like the Atlas SPA. That's preserved; only the delivery
mechanism changed.

One real bug surfaced building this, worth knowing if you touch
`render-brief-document.js`: it constructs a popup's closing
`</script></body></html>` tags as a string, and that file's *source* gets
embedded verbatim (not JSON-escaped, since it needs to execute in the parent
page rather than being embedded as inert text) inside the bundle, which is
itself later pasted inside index.html's own `<script>` tag. An unescaped
`</script>` in the source is invisible to the JS parser but not to the *HTML*
parser — it silently truncates the surrounding script block the moment the
bundle is embedded, breaking everything after it. Fixed by escaping the
slash (`<\/script>`, valid JS, produces the identical string at runtime) —
caught by `verify-inline-bundle.js` actually loading the bundle in a real
page rather than only unit-testing the string output in Node.

Two source trees exist in `src/` for a reason: `report-engine.js` (the full
computation engine) only needs to run **once**, in the parent page, to
produce a model from the current selection. `render-report.js` + `i18n.js`
need to run **again inside every generated popup**, since a new tab has no
access to the parent page's JS — so `render-brief-document.js` embeds their
source as a string and re-executes it there, which is also what makes the
popup's own EN/FR toggle work without contacting index.html again.

## Using it

```bash
node build/build-atlas-bundle.js        # → dist/atlas-inline-bundle.js  (paste into index.html)
```
That file's contents go straight into index.html's `<script>` block —
see `integration/atlas-handoff-snippet.html` for the button and the one
function it calls, `openExecutiveBrief(selectedLicenseIds, lang)`. No
server, no second file to host.

For previewing without touching the real Atlas: `node build/build-report-page.js`
→ `dist/executive-brief.html`, a self-contained dev page that reads `?scope=`
from its own URL (e.g. `?scope=biz-premium,sentinel,entra-p2`). Useful for
testing, not what ships.

## Integrating into `index.html`

See `integration/atlas-handoff-snippet.html` for the full pattern. In short:
paste the built bundle into index.html's existing `<script>` block, then add
one always-visible button in the main UI — not buried in the print modal —
next to wherever the current license scope is already shown back to the
user, wired to `openExecutiveBrief(getSelectedLicenseIds(), lang)`.

Why the main UI and not just the print modal: the printed Executive Summary
has no state of its own — it renders whatever the current selection already
is, so a main-UI button reading that same live state produces identical
input to "print, then click a link in that modal," just reachable one click
earlier and far more discoverable. Nothing about the Executive Brief's
*content* changes — it still reflects exactly one fixed scope, no picker —
because all the interactivity for *choosing* a scope already belongs to the
Atlas's own selection panel; this button just hands off its current answer,
now without needing a second file to hand it off *to*.

## Dynamic, add-on-aware licensing — what changed and why

Licensing isn't a fixed list of scopes; it's a base plan plus any number of
independent add-ons, and Microsoft renames/retires/introduces SKUs on its own
schedule. Three things make that safe here, not just claimed:

1. **`kind` on every license** (`data/licenses.json`) — `"base"` (pick at
   most one per-seat suite), `"addon"` (toggle any number, independently, on
   top of a base), or `"consumption"` (usage/resource billed, not a seat SKU
   at all — Sentinel, Security Copilot, Defender for Cloud). The computation
   never required this distinction to work (`resolveHeldLicenses` accepts any
   combination of ids regardless of kind — see `src/test-engine.js`'s
   6-independent-add-ons and add-on-with-no-base scenarios), but it's what
   lets a picker UI, a validator, or a future maintainer reason about "is
   this a sane selection" without re-deriving the rules from the `includes`
   graph each time.
2. **Unknown-license robustness** (`report-engine.js#resolveHeldLicenses`) —
   an id the catalog doesn't (yet) recognize — a new SKU Microsoft ships
   before this repo is updated for it — is still counted as *held*, so a
   source whose `requiresLicense` already references it still resolves
   correctly. Only bundle *expansion* is skipped (nothing to expand for an id
   with no metadata). The report surfaces this rather than hiding it: a
   visible note lists any selected id the catalog didn't recognize, and
   exactly what that means for the numbers shown.
3. **`src/validate-data.js`** — checks every cross-reference in the data
   graph (source → license, source → MITRE technique, MITRE technique →
   tactic → narrative group, risk-narrative → source, i18n key parity,
   duplicate ids, bilingual symmetry) and fails loudly with a specific,
   actionable message instead of letting a bad edit silently produce a wrong
   report. Run it after any change to `data/` or `i18n/`:
   ```bash
   npm run validate
   ```
   It was stress-tested against six deliberately broken variants (unknown
   license reference, unknown MITRE reference, duplicate id, invalid `kind`,
   dangling `includes`, asymmetric translation) and caught all six before
   being trusted here — a validator that's never seen a real failure is just
   a guess that it works.

## Security posture: every Defender product shown individually

"Defender XDR: 0%" hides more than it tells a CISO — it can't distinguish "MDI
is a total blind spot" from "MDI is fine but MDE is dark." `data/products.json`
adds a `product` field to every source (`mde`, `mdi`, `mdca`, `mdo`, `mdfc`,
plus 8 distinct Purview products) that's finer-grained than the existing
`category`. The posture table (`report-engine.js#computePostureRows`) groups
by product, then rolls products up to their family: a family with one product
still renders as a single row exactly like before; a family with more than
one — Defender XDR (5) and, for free via the same mechanism, Purview (8) —
renders as a bold parent aggregate followed by an indented row per product.
Nothing else needed to change to get this: add a product to `products.json`,
tag sources with it, and it appears automatically — the same principle as
every other data-driven piece of this repo.

One correction came out of building this: Microsoft Learn confirms **Defender
for Office 365 Plan 1 (Safe Links / Safe Attachments) is included in Business
Premium** — `licenses.json`'s `biz-premium` bundle was missing `mdo-p1`. Fixed,
and two verified MDO P1 sources were added (kept intentionally generic —
"Safe Links Policy Activity," not a specific Advanced Hunting table name,
since Advanced Hunting access rules differ by product and weren't separately
re-verified for MDO the way they were for MDE). The dataset grew from 66 to 68
sources accordingly, and the Defender family total is now 19 (the 18 tagged
category `"defender"` + `mdfc-recommendations`, which the real Atlas itself
files under Azure Platform — see the cross-cutting note in
`sources.example.json`). Under bare Business Premium this now shows MDO at
2/3 (67%) while MDE/MDI/MDCA/MDC remain at 0% — a real, sourced improvement
in accuracy, not just a cosmetic split.

## The scope picker: added, then removed — this page has no picker at all

Worth being direct about, since it's exactly the kind of thing that's easy to
get subtly wrong: an earlier revision added a "⚙ Configure exact scope"
panel here — a real, working, dynamically-built license picker (base plan +
grouped add-on checkboxes, covering all 34 catalogued licenses), built in
response to noticing the shipped page only offered 4 hardcoded quick-preset
combinations (the same 4 scopes used to exercise the engine in
`test-engine.js`, carried over as demo convenience rather than a genuine
picker).

That fix was solving the wrong problem. This page is a **translation of the
Atlas's current license-scope selection** — the workflow this whole repo is
built around (see "The workflow this is built for" above): the Atlas is
where a scope gets *chosen*, this page is where that one fixed choice gets
*translated*. An in-page picker lets someone view a scope that was never
actually selected in the Atlas, which quietly turns this from "a translation
of your Atlas findings" into "a second, independent what-if tool" — not
what it's for. The picker (and the quick-preset dropdown alongside it) is
gone. The page now does exactly one thing with scope: read `?scope=` from
the URL — the handoff link the Atlas provides — and render that. If it's
missing, the page says so explicitly (a `.no-scope` state, bilingual) rather
than falling back to a default that could be mistaken for real data.

None of this touches the "dynamic, not static" requirement from earlier —
that was always about the *engine* correctly handling any combination of
licenses (still true, still tested: `test-engine.js` covers 7 scopes
including 6-add-on stacks and no-base-plan edge cases; `verify-report-page.js`
now loads several different `?scope=` URLs directly to prove the same thing
end-to-end in a real browser). Dynamism lives in what the URL contract and
the engine can express, not in whether this page has a picker UI — the
Atlas already has one.

## Ransomware: a dedicated kill-chain view, not a single buried technique

Before this pass, ransomware appeared exactly once in the whole report — a
passing mention of T1486 inside the MITRE section. For a threat this
board-level, that's not enough. `data/ransomware-chain.json` defines six
kill-chain stages (Initial Access → Lateral Movement → Disabling Defenses →
Destroying Recovery Options → Double Extortion → Encryption), each mapped to
the MITRE techniques that represent it. `report-engine.js#computeRansomwareExposure`
checks every stage against the current license scope and reports it
`covered` / `partial` / `blind`, independent of the scored Top 3 risks —
because a threat this significant gets a guaranteed answer, not a
maybe-appearance in a ranked list. It renders as its own subsection (1.3, in
both the HTML brief and the docx) with a headline stat ("N of 6 stages have
zero visibility") and a six-card visual chain.

Five new MITRE techniques back this, all individually verified — one of them
against a **very recent framework change** worth knowing about: MITRE
ATT&CK v19 (April 2026) split the old Defense Evasion tactic (TA0005) into
Stealth (keeps TA0005) and a new Defense Impairment tactic (TA0112), and
retired T1562 "Impair Defenses" in favor of **T1685 "Disable or Modify
Tools"** under TA0112. Since this postdates this tool's training-data cutoff,
it wouldn't have been known without checking attack.mitre.org directly — the
exact failure mode the "verify against the source, not memory" discipline in
this repo exists to catch. T1685 (killing EDR/AV before deploying the
encryptor) is tagged on Business Premium's locked `device-process-events`
and `device-registry-events`, plus a new dedicated `tamper-protection-events`
source — all locked without MDE P2, so "Disabling Defenses" shows fully
blind under bare Business Premium.

Two real bugs came out of building this, both now guarded against
permanently:
- **The "Encryption" stage shipped mapped to zero sources.** T1486 existed in
  `mitre-mapping.json` but had never actually been tagged on anything in
  `sources.example.json` — it would have silently rendered as an
  always-blind stage that *looked* like a real finding instead of a data
  gap. Fixed by tagging it on `device-file-events` (MDE) and
  `cloud-app-events` (MDCA), both genuine Microsoft detection surfaces for
  mass-encryption activity. `validate-data.js` now has a dedicated check —
  every stage must have at least one source tagged with at least one of its
  techniques — reproduced against a scratch copy with the bug reintroduced
  to confirm it actually fires before being trusted.
- **The 1.4 ROI subsection existed in `i18n/*.json` but was never wired into
  either renderer.** Found while inserting the ransomware section next to
  it. Both now render it from the already-computed roadmap data — no new
  narrative text, just surfacing the top 3 `computeRoadmap()` entries that
  were already being computed and shown in full in Section 5.



- **Dataset completeness — now much closer.** Research passes expanded
  `sources.example.json` from 39 to **70 sources**, split into Azure Platform
  (10) / Entra ID (9) / M365 Office (14) / Defender XDR (20, across 5
  distinct products) / Sentinel (6) / Purview (11, across 8 distinct
  products) — matching the real Atlas's category structure (earlier revisions
  incorrectly merged Azure Platform and Entra ID into one category). Every
  addition is sourced from current Microsoft Learn / Microsoft licensing
  documentation (Entra sign-in log types, Purview capabilities actually
  included in Business Premium, Azure native diagnostic logs, MDE Advanced
  Hunting availability, MDO Plan 1 inclusion) — see inline comments in the
  JSON for what's Microsoft-Learn-verified vs. reasonable, well-established
  extrapolation. Cross-checked against a real Business Premium export, this
  now matches **4 of 6 top-level category coverage percentages exactly**
  (Entra ID 89%, Purview 55%, M365/Office 50%, Sentinel 0%); Azure Platform
  and Defender XDR shifted deliberately — see below — for reasons that
  improve accuracy rather than just diverging from the source PDF.
- **Azure Platform now reads 100%, not the source PDF's 90%.** The one locked
  item the real Atlas files under "Azure Platform" (`mdfc-recommendations`)
  is a genuine Defender for Cloud (MDC) capability, not a native Azure one —
  it's now grouped under the Defender family for the posture breakdown
  (see "Security posture" above), which is why Azure Platform on its own is
  now 9/9 active. This is the same "license vs. config gap" distinction the
  tool already draws elsewhere, applied consistently.
- **Defender XDR moved from a flat, admittedly-uncertain "0/16" to a sourced,
  itemized "2/19."** MDO now correctly shows 2/3 active (Defender for Office
  365 Plan 1 is confirmed included in Business Premium — see "Security
  posture" above); MDE/MDI/MDCA/MDC remain accurately at 0%, each for a
  specific, documented reason (Advanced Hunting isn't in Defender for
  Business; MDI/MDCA/MDFC aren't licensed at all under bare Business
  Premium). If you have the real Atlas's own numbers for any of these five
  products specifically, that's the next highest-value cross-check.
- **This is still a second, independently-maintained source of truth**, not
  a shared import from index.html's real data array (3062 lines; GitHub's
  raw endpoint blocked automated retrieval, and the blob view truncates
  around line 1000). Same field shape either way — a drop-in replacement
  updates every computed number/table/MITRE mapping automatically.
- **Pricing** — deliberately omitted from the roadmap table; Microsoft
  pricing changes faster than this repo would, and a wrong number in a
  CISO-facing document is worse than no number.

## Engine semantics worth knowing before editing `sources.example.json`

`gateType` has exactly two values, and they mean different things for the
active/locked split (`report-engine.js#computeSourceStates`):
- `"license"` — gated by `requiresLicense` / `requiresAnyOf`; **locked** only
  if none of those licenses are held.
- `"config"` — needs a diagnostic setting or similar toggle, **no license at
  all**. These always count as *available* for the license-based coverage
  stats (matching how the real Atlas counts "locked" as a licensing concept)
  — but are separately exposed via `needsConfig`/`stats.configGapCount` and
  routed into the Track 1 free-fix list, never Track 2.

## Testing

```bash
npm run validate       # data integrity: every cross-reference, i18n parity, bilingual symmetry
npm run test           # engine correctness across 7 license scopes (incl. add-on stacks, ransomware exposure) + 41 assertions
npm run build:bundle && npm run verify:bundle   # THE production path: builds the inline bundle, then
                                                 # simulates index.html with it pasted in, clicks the
                                                 # button, captures the popup, confirms a blob: URL
                                                 # (no file navigation) and correct bilingual rendering
npm run build:page && npm run verify:page       # dev-preview page smoke test (not what ships)
npm run build:docx -- fr biz-premium            # optional docx export
npm run check           # all of the above
```

## MITRE mapping integrity

Every technique ID in `data/mitre-mapping.json` was checked individually against
attack.mitre.org (tactic, current version) rather than assumed — a few earlier
placeholder groupings turned out to be miscategorized (e.g. a technique that
reads like a lateral-movement issue is officially tagged Credential Access).
`tactic-groups.json` is what lets the report keep a clean A/B/C/D narrative
without forcing a technique into the wrong MITRE tactic to make the story tidy.

The ransomware-chain pass turned up the sharpest example yet of why this
matters more than it sounds like it should: MITRE ATT&CK v19 (April 2026)
retired T1562 and split Defense Evasion into Stealth (TA0005) and a new
Defense Impairment tactic (TA0112). That's after this tool's knowledge
cutoff — recalled from memory, it would have shipped as T1562/TA0005 and
been wrong the moment anyone checked it against a current source. `T1685`
under `TA0112` is what's in the data now, verified directly against
attack.mitre.org's live page, not carried over from training data.
