# Interest survey results (October 2026)

The pre-launch survey in `survey/` (hosted separately from the app) got **22 responses between
2026-10-07 and 2026-10-10**. The raw export and the live results page are kept out of the repo.
Six people left an email for a launch invite. Their addresses are in the export and on the
results page, not here.

This is a small convenience sample reached through personal social posts, so treat the
percentages as rough signals, not measurements.

## Headlines

1. **Demand is real but soft.** 64% would use it (8 definitely, 6 probably). 23% said probably
   not or no, and 14% weren't sure.
2. **The pain predicts the yes.** Of the 8 who rated the hassle 3 or 4, 7 said definitely or
   probably and 1 wasn't sure. All 3 who rated it 1 said probably not or no. Hassle ratings run low overall
   (median 2 of 5), so the product sells to the person who fronts the bills and feels it, not to
   the whole household.
3. **Single payer is the main case.** Two-thirds split by "one person pays everything and sends
   Venmo requests". Ledger-style households (each person owns a bill) are a quarter, and they
   lean positive (4 of 5 said definitely or probably).
4. **The most requested feature doesn't exist yet: Venmo / Zelle pay links (81%).** Lejer
   says "pay however you already do" and never moves money. A deep link that opens Venmo with
   the payee and amount filled in fits that stance and answers the top request.
5. **The core is right.** "Who owes whom" (76%), calendar due dates (57%), works on a phone
   (57%) and the bill PDF (52%) all land. Email reminders scored lower than expected (38%).
6. **Extras are extras.** Trends 33%, rent 29%, documents 19%. They're already feature flags
   that default off, which matches.
7. **The name is a coin flip, leaning no.** Average 2.86 of 5. Nine people rated it 1–2 and
   seven rated it 4–5. The Danish meaning was liked, but people want something more direct or
   punchier. The brand lives in `lib/brand.ts` precisely so it can change before launch.

## Questions and tallies

Percentages are of the people who answered that question.

**How many people do you split household bills with?** (22 answered)

| Answer | n | % |
|---|---|---|
| Two or three | 12 | 55% |
| One other person | 4 | 18% |
| Four or more | 4 | 18% |
| Nobody (live alone / someone else handles it) | 2 | 9% |

**How do you split them now?** (21 answered, pick several)

| Answer | n | % |
|---|---|---|
| One person pays everything and sends Venmo requests | 14 | 67% |
| Each person is in charge of a different bill | 5 | 24% |
| Splitwise or a similar app | 4 | 19% |
| Group chat and memory | 4 | 19% |
| A shared spreadsheet | 1 | 5% |

**How much of a hassle is it?** (20 answered, 1 = no hassle, 5 = constant headache)
Average 2.45, median 2. 1: 3 · 2: 9 · 3: 4 · 4: 4 · 5: 0.

**Would you use a tool like this?** (22 answered)

| Answer | n | % |
|---|---|---|
| Definitely | 8 | 36% |
| Probably | 6 | 27% |
| Not sure | 3 | 14% |
| Probably not | 3 | 14% |
| No | 2 | 9% |

By hassle: rated 1 → 2 no, 1 probably not. Rated 2 → 2 definitely, 3 probably, 2 not sure,
2 probably not. Rated 3 → 3 definitely, 1 not sure. Rated 4 → 2 definitely, 2 probably.

**Which of these would matter most?** (21 answered, pick several). The last column is among
the 14 who said definitely or probably.

| Feature | n | % | Among likely users |
|---|---|---|---|
| Venmo / Zelle links to pay in one tap | 17 | 81% | 12 of 14 |
| A clear "who owes whom" ledger | 16 | 76% | 12 of 14 |
| Due dates in my phone's calendar | 12 | 57% | 9 |
| Works great on my phone | 12 | 57% | 8 |
| The actual bill (PDF) attached to each charge | 11 | 52% | 8 |
| Email reminders before a bill is due | 8 | 38% | 7 |
| Charts of what we spend over time | 7 | 33% | 6 |
| Rent tracking, not just utilities | 6 | 29% | 5 |
| A place for the lease and other house paperwork | 4 | 19% | 2 |

**How appealing is the name Lejer?** (22 answered, 1 = not for me, 5 = love it)
Average 2.86, median 3. 1: 4 · 2: 5 · 3: 6 · 4: 4 · 5: 3. Among the 14 likely users it's
about the same (average 3.0).

## What people wrote

**Anything else you'd want it to do?** One real answer:

> Should take into account if there can be cross payments. If I owe Person A $10 but Person A
> owes Person B $10 dollars the money can be sent to B and it is clear both debts are paid.

This is multi-party debt simplification. Today the ledger is gross by design and `netPairs()`
only hints at settling between two people who owe each other (ARCHITECTURE.md §3, "Gross
ledger with a net hint"). A chain across three people isn't covered, and a payment can't be
recorded as clearing someone else's debt.

**What does the name make you think of? Got a better one?**

> branding needs to be super unique and planned like its a cool name but do likr a cool and
> crazy color scheme and something for it to stand out like [the peach theme] i love [it] because
> its not boring ai bland theme

> "Heidi"

> picky observation but could be related to leisure - making people think of paying at your
> own leisure (still like the name over anything else)

> I think that the etymology is great but I also think that you need something more direct
> and understandable. BillSplit or something like that that is direct and straight to the
> point would likely get more attention.

> Ledger/list

> The name needs harder sounds like Grock, Cento, Burton, Kirkland

> Makes me think of heath ledger. So you could name it heath.

## What this suggests for the build

- **Add pay links.** A Venmo handle (and maybe a Zelle email/phone) per membership on
  `/account`, and a "Pay $X on Venmo" button wherever someone sees what they owe: the dashboard,
  the bill, and the new-bill and reminder emails. It's a link, not a payment: checking off stays
  the owner's job, so the "never moves money" promise holds.
- **Lead with the single payer.** The person fronting everything is the buyer. Onboarding, the
  public site and the demo should speak to them first; ledger mode stays, as a strong second.
- **Keep the phone and calendar paths first-class.** Both scored above email reminders. The
  calendar feed already exists; make subscribing obvious.
- **Don't oversell reminders.** Only 38% picked them. They still do the chasing nobody wants to
  do, but they may read better as "Lejer does the nagging" than as a feature.
- **Leave trends, rent and documents off by default**, as they are.
- **Consider settle-up across people** (the cross-payment request) as a later, careful change
  to the gross-ledger decision, not a quick fix.
- **Revisit the name before launch**, and give the look personality. One respondent singled out
  the peach theme for not looking "AI bland". Changing the name is `lib/brand.ts` plus the domain
  and mail setup.
