# Epique Income Split \& Cap Findings

**Date:** 2026-04-27 17:17 PDT  
**Source:** Direct inspection of Google Sheets via CSV export  
**Status:** Root cause identified, fix in progress

---

## Executive Summary

**CRITICAL BUG IDENTIFIED:** All transaction income fields show $0 because `rebuild-snapshot.js` uses wrong column names.

**Actual column names in Master Closed 2026:**
- Column 20: `Haven` (script looks for "Haven Income" ❌)
- Column 22: `Agent` (script looks for "Agent Income" ❌)
- Column 24: `Epique Income` (script doesn't capture this at all ❌)

**Fix:** Update column mappings in rebuild script + add Epique income field.

---

## Income Split Structure (Source-Backed)

### Master Closed 2026 Sheet (High-Level Split)

| Column | Name | Purpose |
|--------|------|---------|
| 19 | `Referral` | Referral flag (yes/no) |
| 20 | `Haven` | **Haven's income** (GCI) |
| 21 | `Haven B&O` | Haven's B&O tax |
| 22 | `Agent` | **Agent's income** |
| 23 | `Agent B&O` | Agent's B&O tax |
| 24 | `Epique Income` | **Epique's income** (NOT CURRENTLY CAPTURED) |
| 25 | `Zillow Flex Referral` | Zillow Flex referral fee amount |
| 26 | `Redfin Referral` | Redfin referral fee amount |
| 16 | `Personal Sphere` | Personal sphere referral amount |

### Payout Dashboard Sheet (Detailed Breakdown Per Agent)

**Agent's Commission Breakdown:**
| Column | Name | Purpose |
|--------|------|---------|
| 10 | `Agent's Gross Commission` | Agent's gross before fees/taxes |
| 11 | `Haven Agent TF` | Transaction fee to Haven |
| 12 | `Epique 15% TF` | Epique's 15% transaction fee (capped at $5,000) |
| 14 | `Epique TF` | Epique TF (smaller of 0.1% of price or $250) |
| 16 | `Agent B&O Tax` | Agent's B&O tax |
| 17 | `Agent's Net Commission` | **Agent's take-home pay** |

**Haven's Commission Breakdown:**
| Column | Name | Purpose |
|--------|------|---------|
| 18 | `Haven's Gross Commission` | Haven's gross (cap-eligible if personal) |
| 19 | `Haven-Epique 15% fee` | Fee paid to Epique (capped at $10,000) |
| 21 | `Haven B&O Tax` | Haven's B&O tax |
| 22 | `Haven's Net Commission` | **Haven's take-home** |

**Epique's Commission Breakdown:**
| Column | Name | Purpose |
|--------|------|---------|
| 23 | `Epique Commission Breakdown` | **Epique's total cut** (15% + 16% + TF + taxes) |

**Referral Fees:**
| Column | Name | Purpose |
|--------|------|---------|
| 7-9 | `Referral Fee (Zillow / Redfin / Other)` | Referral payout amounts |

---

## Epique Cap Rule (Cambria Requirement)

**Cap Target:** $5,000 per agent per cap year  
**Cap Type:** Transaction fee portion (Epique TF columns 12 + 14)  
**Reset Date:** April 7 (assumed same as Haven/Sphere cap — **needs verification**)  
**Source:** Payout Dashboard columns 12 (`Epique 15% TF`) and 14 (`Epique TF`)

**Current Status:**
- ✅ Source data EXISTS (Epique TF columns present)
- ❌ NOT currently tracked in snapshot
- ❌ No cap progress calculation
- ❌ No cap year reset logic for Epique specifically

**Implementation Needed:**
1. Add `epiqueCapProgress` field to agent snapshot
2. Add `epiqueCapTarget` = 5000
3. Track cumulative Epique TF per agent per cap year (April 7 - April 6)
4. Display in Results \& Pay tab alongside Haven/Sphere cap

---

## Privacy Scoping Rules

**Agent-Facing Views:**
- ✅ Agent sees their own `Agent's Net Commission` (col 17)
- ⚠️ **DECISION NEEDED:** Should agents see full split (Haven/Epique amounts)?
  - Current implementation: Agents see only their own income
  - Cambria says "this split needs to be shown" — clarify if this means to admins only or to all agents
  - **Recommendation:** Show full split to admins only, agents see only their own income + referral fees

**Admin-Facing Views:**
- ✅ Full income split visible (Agent/Haven/Epique/Referral)
- ✅ Transaction fee breakdown (Haven TF / Epique TF)
- ✅ Epique cap progress per agent

---

## Implementation Checklist

### Phase 1: Fix Zero-Income Bug (IN PROGRESS)
- [ ] Update `rebuild-snapshot.js` line 310: `row['Haven']` instead of `row['Haven Income']`
- [ ] Update `rebuild-snapshot.js` line 455: `row['Agent']` instead of `row['Agent Income']`
- [ ] Add `row['Epique Income']` capture (line ~310, ~455)
- [ ] Add `epiqueIncome` field to `incomeBreakdown` model in `lib/snapshot.ts`
- [ ] Update pending transactions with same fixes

### Phase 2: Add Epique Cap Tracking
- [ ] Load Epique TF from Payout Dashboard (cols 12 + 14)
- [ ] Calculate cumulative Epique TF per agent per cap year
- [ ] Add `epiqueCapProgress` and `epiqueCapTarget` to agent snapshot
- [ ] Verify cap year reset date (April 7 or different?)
- [ ] Display Epique cap progress in Results \& Pay tab

### Phase 3: Update Transaction Detail UI
- [ ] Add income split display to `app/agent/[id]/closings/page.tsx`
- [ ] Show: Agent Income | Haven Income | Epique Income | Referral Fee
- [ ] Add transaction fee breakdown (Haven TF | Epique TF)
- [ ] Preserve privacy scoping (admin-only for Haven/Epique amounts?)
- [ ] Replace $0 with "Not available in source" for unmapped fields

### Phase 4: Verification
- [ ] Run `node scripts/rebuild-snapshot.js`
- [ ] Verify `current.json` has non-zero `agentIncome` and `havenIncome`
- [ ] Verify `epiqueIncome` field is present
- [ ] Verify Epique cap progress is calculated
- [ ] Run `scripts/audit-zero-income.js` — should show 0 zero-income transactions

---

## Source Data Availability Summary

| Field | Source Sheet | Column | Status |
|-------|-------------|--------|--------|
| Agent Income | Master Closed 2026 | `Agent` (col 22) | ✅ Available, not mapped |
| Haven Income | Master Closed 2026 | `Haven` (col 20) | ✅ Available, not mapped |
| Epique Income | Master Closed 2026 | `Epique Income` (col 24) | ✅ Available, not captured |
| Referral Fee | Master Closed 2026 | `Zillow Flex Referral` (col 25), `Redfin Referral` (col 26), `Personal Sphere` (col 16) | ✅ Available, partially mapped |
| Agent's Net Commission | Payout Dashboard | `Agent's Net Commission` (col 17) | ✅ Available |
| Haven's Net Commission | Payout Dashboard | `Haven's Net Commission` (col 22) | ✅ Available |
| Epique Commission Breakdown | Payout Dashboard | `Epique Commission Breakdown` (col 23) | ✅ Available |
| Epique 15% TF (cap portion) | Payout Dashboard | `Epique 15% TF` (col 12) | ✅ Available |
| Epique TF (cap portion) | Payout Dashboard | `Epique TF` (col 14) | ✅ Available |
| Epique Cap Progress | Payout Dashboard | Calculated from cols 12+14 | ⚠️ Needs implementation |
| Epique Cap Target | N/A | Hardcoded $5,000 | ✅ Known rule |

---

## Next Steps

1. **Sub-agent is fixing rebuild-snapshot.js now** — will verify after completion
2. **Await Cambria decision on privacy scoping:** Should agents see full income split (Haven/Epique amounts) or only their own income?
3. **Verify Epique cap year reset:** Does it use April 7 (same as Haven/Sphere) or a different date?
4. **After fix is deployed:** Re-run zero-income audit to confirm resolution

---

## Files Modified

| File | Change | Status |
|------|--------|--------|
| `docs/ACTIVITY-SOURCE-AUDIT.md` | Updated with Epique findings + column inventory | ✅ Done |
| `docs/EPIQUE-INCOME-SPLIT-FINDINGS.md` | This document | ✅ Created |
| `scripts/rebuild-snapshot.js` | Column name fixes + Epique income capture | ⚠️ In progress (sub-agent) |
| `lib/snapshot.ts` | Add `epiqueIncome` to transaction model | ⚠️ Pending |
| `app/agent/[id]/closings/page.tsx` | Display income split | ⚠️ Pending |
| `app/admin/closings/page.tsx` | Display full income split (admin) | ⚠️ Pending |
