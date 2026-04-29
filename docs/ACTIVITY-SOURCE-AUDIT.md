# Activity Source Audit — Haven Performance Hub

**Date:** 2026-04-27  
**Last Updated:** 2026-04-27 17:17 PDT (Epique cap + income split findings)  
**Purpose:** Map all available activity metrics to source sheets, identify gaps, and prioritize dashboard changes for activity-focused gap analysis.

---

## Cambria's Requirements (Scope Update 2026-04-27)

Dashboard must primarily answer: **What activities drive results and where is the breakdown?**

### Required Activity Funnel Metrics
1. **Leads** — by source (Zillow, sphere, referral, floor time, etc.)
2. **Sphere activity** — tracked manually or via FUB
3. **Offers written vs accepted** — conversion tracking
4. **CMAs done vs listings taken** — listing conversion funnel
5. **Listings sold** — listing-to-close rate
6. **Showings average before writing an offer** — showing-to-offer conversion
7. **Weekly activities** — calls, emails, texts, appointments set
8. **Pendings** — in-flight deals
9. **Closings** — results (secondary view, not primary)

### Privacy Requirements
- Preserve privacy scoping (agents see only their own financials)
- Admin-only fields: Haven Income (GCI), B&O Tax, Transaction Fees
- Leaderboard anonymization for non-top agents

---

## Current Source Sheets & Available Data

### 1. Haven Transactions 2026 (`1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl`)

| Tab Name | Data Available | Used In Dashboard | Gaps |
|----------|---------------|-------------------|------|
| **Spokane Agent Roster** | Agent names, IDs, contact info | ✅ Roster building | None |
| **CDA Agent Roster** | Agent names, IDs, contact info | ✅ Roster building | None |
| **MASTER HAVEN PNDS** | Pending transactions, purchase prices, agent income, lead source, contract dates, expected closing dates | ✅ Pending counts, pending volume, pending details | ❌ No offers-written tracking, no showing counts |
| **Master Closed 2026** | Closed transactions, purchase prices, **Haven income (col 20 "Haven")**, **Agent income (col 22 "Agent")**, **Epique Income (col 24)**, referral amounts (Zillow Flex col 25, Redfin col 26), lead source, closing dates, settlement dates | ✅ Closed counts, closed volume, closed details | ⚠️ **CRITICAL BUG**: rebuild-snapshot.js looks for "Haven Income" and "Agent Income" columns but actual column names are just "Haven" and "Agent" — all income fields show $0 |
| **Listings** | Active listings by agent | ✅ `activeListings` count | ❌ No listing-take date, no listing-to-pending conversion time |
| **CMAS_2026** | CMA completions by agent | ✅ `cmasCompleted` count | ❌ No CMA-to-listing conversion tracking |

### 2. Haven Master Payout & Cap Dashboard (`15Wfyp7Z8hvLayj2DtPQ9K_ydtdwIUojLhmlVzHOra3k`)

| Tab Name | Data Available | Used In Dashboard | Gaps |
|----------|---------------|-------------------|------|
| **Agent-specific tabs** (e.g., "Amy Sparrow") | **Full income split**: Purchase Price, Gross Commission, **Agent's Gross Commission (col 10)**, **Haven's Gross Commission (col 18)**, **Haven's Net Commission (col 22)**, **Epique Commission Breakdown (col 23)**, **Epique TF (col 14, capped at $250)**, **Epique 15% TF (col 12, capped at $5,000)**, Transaction Fees, Referral Fees, Agent B&O Tax, Haven B&O Tax | ✅ `capProgress`, `capContributingTransactions` | ⚠️ **Epique cap tracking**: Epique has separate $5,000 cap (transaction fee portion). Need to verify if this is tracked per agent per cap year (April 7 reset). Source has Epique TF columns but no explicit "Epique Cap Progress" summary. |
| **Cap Summary** | Exists but not yet inventoried | ❌ Not loaded | Need full inventory — may contain cap progress totals |

**Income Split Structure (from Payout Dashboard):**
- **Agent's Net Commission** (col 17) — What agent takes home
- **Haven's Net Commission** (col 22) — Haven's cut after fees
- **Epique Commission Breakdown** (col 23) — Epique's total cut (15% + 16% + TF + taxes)
- **Referral Fee** (col 7-9) — Referral payout if applicable
- **Transaction Fees** split between Haven Agent TF (col 11) and Epique TF (col 12, 14)

### 3. Weekly Zillow Stats (`1cqoprcDPxah-1b9gSUiXwNUFBlCcfrq5-XyUmIarmI`)

| Tab Name | Data Available | Used In Dashboard | Gaps |
|----------|---------------|-------------------|------|
| **Buyer Connections 30D** | Showings count per agent (30-day rolling) | ✅ `showings` count | ❌ No historical trend, no showing-to-offer conversion |
| *(Other tabs not yet loaded)* | Unknown | ❌ Not loaded | Need to inventory all tabs |

### 4. Zillow Transactions Tracking

| Tab Name | Data Available | Used In Dashboard | Gaps |
|----------|---------------|-------------------|------|
| *(Not yet inventoried)* | Zillow lead attribution, conversion tracking | ❌ Not loaded | Need full inventory |

### 5. Team Commission Level Tracking

| Tab Name | Data Available | Used In Dashboard | Gaps |
|----------|---------------|-------------------|------|
| *(Not yet inventoried)* | Split levels, commission tiers | ❌ Not loaded | Need full inventory |

---

## Metrics Status: Source-Backed vs Missing

### ✅ Currently Source-Backed (Available Now)

| Metric | Source | Dashboard Field | Notes |
|--------|--------|-----------------|-------|
| **Closed transactions** | Master Closed 2026 | `closedTransactions` | Working |
| **Closed volume** | Master Closed 2026 | `closedVolume` | Working |
| **Pending transactions** | MASTER HAVEN PNDS | `pendingTransactions` | Working |
| **Pending volume** | MASTER HAVEN PNDS | `pendingVolume` | Working |
| **Active listings** | Listings tab | `activeListings` | Working |
| **CMAs completed** | CMAS_2026 | `cmasCompleted` | Working |
| **Zillow leads (30D showings)** | Weekly Zillow Stats | `showings`, `zillowLeads` | Working |
| **Cap progress** | Payout Dashboard | `capProgress` | Working |
| **Lead source** | Both closed/pending sheets | `leadSource` | Working |
| **Referral tracking** | Closed/pending sheets | `referralTransactions` | Working |
| **Income split (Agent/Haven/Epique/Referral)** | Payout Dashboard | ❌ NOT YET IMPLEMENTED | **Source-backed but not mapped** — Payout Dashboard has all columns needed (Agent's Gross/Net, Haven's Gross/Net, Epique Breakdown, Referral Fee). Master Closed 2026 has "Haven", "Agent", "Epique Income" columns but rebuild script uses wrong column names. |

### ⚠️ Partially Source-Backed (Needs Mapping/Calculation)

| Metric | Source | Current Status | What's Needed |
|--------|--------|----------------|---------------|
| **Zillow conversion rate** | Weekly Zillow Stats + Closed | Calculated as `closings / leads` | Need to verify Zillow lead count source |
| **CMA-to-listing conversion** | CMAS_2026 + Listings | ❌ Not calculated | Cross-reference CMA addresses with listing addresses |
| **Listing-to-pending conversion** | Listings + MASTER HAVEN PNDS | ❌ Not calculated | Match listing addresses to pending addresses |
| **Listing-to-close conversion** | Listings + Master Closed | ❌ Not calculated | Match listing addresses to closed addresses |
| **Showings-to-offer ratio** | Weekly Zillow Stats + Pendings | ❌ Not calculated | Need offers-written count (not in source) |
| **Week-over-week trends** | Historical snapshots | ⚠️ Partial (timeWindowStats exists) | Need consistent weekly snapshot comparison |

### ❌ Missing From Current Sources (Not Available)

| Metric | Why Missing | Source Needed | Priority |
|--------|-------------|---------------|----------|
| **Offers written** | Not tracked in any current sheet | Add column to MASTER HAVEN PNDS or separate "Offers" tab | HIGH |
| **Offers accepted** | Not tracked separately from pendings | Add column to MASTER HAVEN PNDS | HIGH |
| **Offer-to-pending conversion** | Requires offers-written data | See above | HIGH |
| **Calls made** | FUB integration not connected | Follow Up Boss API integration | MEDIUM |
| **Emails sent** | FUB integration not connected | Follow Up Boss API integration | MEDIUM |
| **Texts sent** | FUB integration not connected | Follow Up Boss API integration | MEDIUM |
| **Appointments set** | FUB integration not connected | Follow Up Boss API integration | MEDIUM |
| **Tasks completed** | FUB integration not connected | Follow Up Boss API integration | LOW |
| **Notes added** | FUB integration not connected | Follow Up Boss API integration | LOW |
| **Showings per offer** | Requires offers-written + showings | Combine Zillow stats + new offers tracking | HIGH |
| **Days on market (listing to pending)** | Requires listing-take date | Add `listingDate` to Listings tab | MEDIUM |
| **Days to close (pending to close)** | Requires both dates | Calculate from existing dates | MEDIUM |
| **Epique cap progress** | Not explicitly tracked | Payout Dashboard has Epique TF columns but no cap progress summary | HIGH — **Cambria requirement** |
| **Transaction fee breakdown** | Not mapped in rebuild script | Payout Dashboard has Epique TF, Haven TF columns | HIGH — **Cambria requirement** |

---

## Dashboard Redesign Recommendations

### Primary View: Activity Funnel (Not Results)

**Current structure:** Overview → Weekly Activity → Results & Pay  
**Recommended structure:** Activity Funnel → Pipeline → Results

#### Tab 1: Activity Funnel (Primary)
**Purpose:** Show what activities are happening and where breakdowns occur

**Visual components:**
1. **Lead Intake Funnel** (horizontal funnel chart)
   - Total leads (all sources)
   - → Leads contacted
   - → Showings scheduled
   - → Offers written
   - → Offers accepted (pendings)
   - → Closed

2. **Conversion Rates** (grid of rate cards)
   - Lead-to-showing: `showings / leads`
   - Showing-to-offer: `offers / showings` ⚠️ needs offers data
   - Offer-to-pending: `pendings / offers` ⚠️ needs offers data
   - Pending-to-close: `closings / pendings` (historical avg)
   - CMA-to-listing: `listings from CMAs / total CMAs` ⚠️ needs address matching

3. **Weekly Activity Trends** (line chart)
   - 4-week rolling: leads, showings, offers, pendings
   - Compare current week vs prior 3 weeks

4. **Breakdown Alerts** (callout boxes)
   - "High showings, low offers" → coaching opportunity
   - "High offers, low pendings" → negotiation support needed
   - "Low CMA-to-listing" → listing presentation training

#### Tab 2: Pipeline (Secondary)
**Purpose:** Show in-flight work and expected outcomes

**Visual components:**
1. **Pending Deals Table** (existing, enhanced)
   - Address, agent, contract date, expected close
   - Expected agent income (privacy-scoped)
   - Days in pipeline
   - Lead source tag

2. **Active Listings** (new section)
   - Address, list date, days on market
   - Showing count (from Zillow stats)
   - Offer status (none / received / accepted)

3. **Upcoming Closings** (next 30 days)
   - Sorted by expected close date
   - Income preview (privacy-scoped)

#### Tab 3: Results (Tertiary)
**Purpose:** Historical performance and earnings

**Visual components:**
1. **Closed Transactions** (existing closings page, embedded)
2. **Cap Progress** (existing)
3. **Referral Income** (existing)
4. **Week-over-Week Comparison** (existing timeWindowStats)

---

## Implementation Plan

### Phase 1: Audit & Data Mapping (Current Task)
- [x] Inventory current source sheets
- [x] Map available metrics to dashboard fields
- [x] Identify missing metrics and required sources
- [ ] Verify zero-income root cause (separate issue)
- [ ] Document exact column mappings for each sheet

### Phase 2: Dashboard Redesign (Next Priority)
- [ ] Redesign agent dashboard with Activity Funnel as primary tab
- [ ] Add conversion rate calculations (where data exists)
- [ ] Add "breakdown alerts" for coaching opportunities
- [ ] Preserve privacy scoping for financial fields
- [ ] Keep closings as detail view, not primary metric

### Phase 3: Source Sheet Enhancements (Requires Cambria/Broker Action)
- [ ] Add "Offers Written" column to MASTER HAVEN PNDS
- [ ] Add "Offer Status" column (Written / Accepted / Fallen Through)
- [ ] Add `listingDate` to Listings tab
- [ ] Create "Offers Tracking" sheet (optional, if PNDS is crowded)

### Phase 4: FUB Integration (Future)
- [ ] Connect Follow Up Boss API for calls/emails/texts
- [ ] Map FUB activities to weekly stats
- [ ] Add FUB-derived conversion metrics

---

## Zero-Income Issue (Parallel Track) — ROOT CAUSE IDENTIFIED

**Finding:** 98 closed transactions all show `agentIncome: 0` and `havenIncome: 0`.

**Root Cause:** Column name mismatch in `rebuild-snapshot.js`.

**Actual column names in Master Closed 2026:**
- Column 20: `Haven` (not "Haven Income")
- Column 22: `Agent` (not "Agent Income")
- Column 24: `Epique Income` (NOT being captured at all)
- Column 19: `Referral` (flag)
- Column 25: `Zillow Flex Referral` (amount)
- Column 26: `Redfin Referral` (amount)

**Current broken code (line 310, 455):**
```javascript
const havenIncome = parseCurrency(row['Haven Income'] || row['GCI']) || 0;
const agentIncome = parseCurrency(row['Agent Income'] || row['agent income']);
```

**Fix needed:**
```javascript
const havenIncome = parseCurrency(row['Haven'] || row['GCI']) || 0;
const agentIncome = parseCurrency(row['Agent'] || row['agent']) || 0;
const epiqueIncome = parseCurrency(row['Epique Income']) || 0;
```

**Income Split Model (from Payout Dashboard):**
- **Agent's Net Commission** — What agent earns
- **Haven's Net Commission** — Haven's cut
- **Epique Commission Breakdown** — Epique's total (15% + 16% + TF + taxes)
- **Referral Fee** — Referral payout (Zillow Flex, Redfin, or other)
- **Transaction Fee Split** — Haven Agent TF + Epique TF (capped at $5,000 for Epique)

**Epique Cap Rule (Cambria 2026-04-27):**
- Epique has separate **$5,000 cap** (transaction fee portion)
- Resets April 7 (same as Haven/Sphere cap — needs verification)
- Tracked via Epique TF columns in Payout Dashboard
- **NOT currently tracked in snapshot** — needs implementation

**Next Steps:**
1. Fix column mappings in `rebuild-snapshot.js` (Haven, Agent, Epique Income)
2. Add Epique income field to transaction detail model
3. Add Epique cap progress tracking ($5,000 target)
4. Update transaction detail UI to show full split (Agent/Haven/Epique/Referral)
5. Verify cap year reset date for Epique cap

---

## Privacy & Security Checklist

- [x] Agent views show only their own transactions
- [x] Admin views show all transactions with full financials
- [x] Leaderboard anonymizes agents outside top 5
- [x] Haven Income (GCI) hidden from non-admin agent views
- [x] B&O Tax and Transaction Fee hidden from non-admin views
- [x] `sanitizeAgentData()` removes sensitive fields before API response
- [x] `sanitizeLeaderboard()` anonymizes lower-ranked agents

---

## Files Modified/Created

| File | Purpose | Status |
|------|---------|--------|
| `docs/ACTIVITY-SOURCE-AUDIT.md` | This document | ✅ Created |
| `scripts/audit-zero-income.js` | Zero-income transaction audit | ✅ Created |
| `data/zero-income-audit.json` | Audit results | ✅ Created |
| `docs/ACTIVITY-SOURCE-AUDIT.md` | This document (updated with Epique findings) | ✅ Updated |
| `app/agent/[id]/page.tsx` | Agent dashboard (needs redesign) | ⚠️ Needs update |
| `scripts/rebuild-snapshot.js` | Snapshot generation | ⚠️ **CRITICAL**: Needs column name fixes (Haven, Agent, Epique Income) + Epique cap tracking |

---

## Next Actions

### IMMEDIATE (Blocker Fixes)
1. **Fix zero-income issue** — Update `rebuild-snapshot.js` column mappings:
   - `row['Haven Income']` → `row['Haven']`
   - `row['Agent Income']` → `row['Agent']`
   - Add `row['Epique Income']` capture
2. **Add Epique cap tracking** — Model $5,000 Epique cap, track via Epique TF columns
3. **Verify cap year reset** — Confirm Epique cap uses April 7 reset (same as Haven/Sphere)

### HIGH PRIORITY (Cambria Requirements)
4. **Redesign agent dashboard** — Activity funnel as primary view
5. **Add income split display** — Show Agent/Haven/Epique/Referral breakdown in transaction details
6. **Add conversion calculations** — Where source data exists
7. **Add transaction fee breakdown** — Show Epique TF vs Haven TF, track Epique cap progress

### MEDIUM PRIORITY (Source Sheet Enhancements — Requires Cambria/Broker Action)
8. **Add "Offers Written" column** to MASTER HAVEN PNDS
9. **Add "Offer Status" column** (Written / Accepted / Fallen Through)
10. **Add `listingDate`** to Listings tab
11. **Create "Offers Tracking" sheet** (optional, if PNDS is crowded)

### FUTURE (FUB Integration)
12. Connect Follow Up Boss API for calls/emails/texts
13. Map FUB activities to weekly stats
14. Add FUB-derived conversion metrics
