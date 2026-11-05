---
target: household app navigation and page flow
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:app/(household)/[household]"
timestamp: 2026-10-13T02-38-03Z
slug: app-household-household
---
Method: dual-agent (A: design review · B: detector + browser)

Target: the household app's navigation and page flow (app/(household)/[household], app/components, app/(app)). Sheet theme, seed household oak-lane, viewer an admin; 1440 and 390.

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Settings mixes two save models (Look autosaves, the rest waits for a Save ~2,800px down); the phone bar never names the current section |
| 2 | Match system / real world | 3 | "Household" is a tab, the house, and a Settings group; the same debt reads "ALEX → SAM" on Bills and "Alex owes you" on Overview |
| 3 | User control and freedom | 3 | Account/Your households drop you on the marketing shell; the way back is a generic "Open" |
| 4 | Consistency and standards | 2 | The primary action sits in a different place on every page; every "add" works differently |
| 5 | Error prevention | 3 | Confirms everywhere; destructive actions buried two dialogs deep |
| 6 | Recognition rather than recall | 2 | The check-off lives on Bills, not the Overview every email opens; desktop row actions are icon-only |
| 7 | Flexibility and efficiency | 2 | Overview rows aren't links; no path from a bill on Overview to its actions |
| 8 | Aesthetic and minimalist design | 3 | Clean surfaces; Household stacks four jobs (~13 admin actions), Settings ~30 controls |
| 9 | Error recovery | 3 | Inline errors keep what was typed |
| 10 | Help and documentation | 3 | Excellent hints; the tour is forced on first visit, findable later only from the footer |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict
Specific skin, interchangeable skeleton. The summary strip, the house ledger in sentences, due chips and the four themes are authored for Lejer; the flow is generic CRUD: six noun tabs, Edit/Remove columns, one long settings form, a separate Account area. It follows the data model, not the monthly ritual (statement arrives → post → people pay → check off → reminders). Detector: 0 findings in the 59 target source files; browser overlay (headless) found sheet's 0.66rem eyebrows/table heads under 11px (96), 3.7:1 placeholders on Settings (6), ~11.9px hints on phones; 61 occlusion/overflow hits are false positives (closed <details> menus), as are cramped-padding on table panels, the peach swatch stripes, and the sheet grid (intentional).

## Priority Issues
1. [P1] No consistent action slot. Overview: none (title slot holds calendar buttons). Bills: "+ Add bill" on a mid-page section rule. Docs: floating right on its own row. Household: slot holds "Email everyone"; the real primary "Send invite" is in the third panel. Trends: slot holds "Download CSV". Settings: Save at the very bottom (sticky on phones only). Fix: one header slot, page primary or nothing; section actions on section rules. /impeccable layout
2. [P1] Overview is where every email lands but is a dead end; Bills is a near-duplicate list with the powers. Fix: rows link to the bill on Bills, or owners check off inline on Overview. /impeccable distill
3. [P1] Household/Settings split: Leave/Delete/CSV on Household, bill preferences in Settings, "Household" means three things; 6 tabs + name menu, 9-row phone menu. Fix: name the tab for what it holds; one home for household-level destructive actions. /impeccable clarify
4. [P2] Account/Your households cross into the marketing shell (How it works · About · black "Open" CTA outranking Save); Sign out twice on Account. Fix: a back link naming the household. /impeccable layout
5. [P2] Every verb works differently: add = Dialog / inline disclosure ("Close" + "Cancel") / always-open form; edit = text vs pencil; remove = inline vs inside Edit with a nested confirm. Fix: one rule per verb. /impeccable distill

## Persona Red Flags
- Roommate from a Reminder email (phone, monthly): first visit lands on the tour, not "$21.09 to Alex"; Overview rows do nothing when tapped; calendar buttons sit between the strip and the ledger; Menu has 9 rows.
- Owner just Venmo'd (phone): arrives on Overview, no check-off there; Menu → Bills → scroll past "Still owed" → checkbox mid-card.
- Keyboard user: switcher and name menu are <details> that don't close on Escape/outside click and can both be open; icon-only Remind/Edit rely on title.

## Minor Observations
Trends has no household eyebrow; Docs/Documents and "How this works"/"How it works" mismatches; Email everyone is the only page with a back link; member cards on phones put Edit alone on a row; Bills on record takes a third of the strip; sheet eyebrows 0.66rem; settings placeholders 3.7:1.

## Questions to Consider
- Does Lejer need both Overview and Bills, or should Overview carry the owner's check-offs?
- What if every page had one title-right slot and left it empty when nothing earned it?
- Does Settings (opened twice a year) earn a top-bar tab, and should Account stay a trip to the site?
