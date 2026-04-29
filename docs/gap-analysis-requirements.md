# Haven Performance Hub - Gap Analysis Requirements Audit

**Date:** 2026-04-28
**Type:** Requirements & Schema Audit (NO CODE CHANGES)
**Production URL:** https://haven-dashboard.vercel.app
**Recent Deployment:** cababb73 (income/source dashboards for closed/pending)

---

## 1. Current Google Sheets Source Mapping

### Primary Source File
- **Sheet ID:** `1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl` (Haven Transactions 2026)
- **Loader:** `/lib/google-sheets-loader.ts`

### Tabs Currently Used

| Tab Name | GID | Purpose | Status |
|----------|-----|---------|--------|
| MASTER HAVEN PNDS | 0 | Pending/current pipeline transactions | ✅ Active |
| Master Closed 2026 | 1 | Closed/sold transactions | ✅ Active |
| Spokane Agent Roster | 1454437421 | Active agent membership | ✅ Active |
| Upcoming Listings | 1196688652 | Future listings (not currently loaded) | ⚠️ Unused |
| Listings | 1085800109 | Active listings count per agent | ✅ Active |
| Closed_Off Market Listings | 1044193093 | Excluded per business rules | ❌ Excluded |
| Spokane Rescissions | 862721766 | Rescinded deals (not currently loaded) | ⚠️ Unused |
| CMAS_2026 | 1932605207 | CMA completion tracking | ✅ Active |
| Sorting 2 | 2043111127 | Excluded per business rules | ❌ Excluded |
| Sorting 3 | 1948698996 | Excluded per business rules | ❌ Excluded |

### Current Column Mapping (Master Closed 2026 / MASTER HAVEN PNDS)

**Verified 2026-04-28, 0-indexed:**

| Index | Column Name | Used For |
|-------|-------------|----------|
| 0 | (empty/merged) | - |
| 1 | Purch/List | Transaction side (buyer/seller) |
| 2 | Res Land Comm | - |
| 3 | Comm % | - |
| 4 | Mutual Acceptance | Contract date |
| 5 | CLOSING | Closing date |
| 6 | Commission Request Sent | - |
| 7 | Agent | Agent name matching |
| 8 | PRICE | Purchase price |
| 9-11 | (various) | - |
| 12 | ADDRESS | Property address |
| 13 | Zip Code | - |
| 14 | Personal Sphere | Sphere flag (yes/no) |
| 15 | Client First Name | - |
| 16 | Client Last Name | - |
| 17 | (empty) | - |
| 18 | Referral $ | Referral fee amount |
| 19 | Haven B&O | B&O tax |
| 20 | Haven Income | GCI |
| 21 | Agent B&O | - |
| 22 | Agent Income | Agent commission |
| 23 | Epique Income | Epique commission |
| 24 | (empty) | - |
| 25 | Lead Generated | Lead source |

---

## 2. Existing Fields Audit

### Fields Already Implemented

| Field | Source | Status | Notes |
|-------|--------|--------|-------|
| **Transactions** | Master Closed 2026, MASTER HAVEN PNDS | ✅ Implemented | Closed and pending with full income breakdown |
| **Listings (active count)** | Listings tab | ✅ Implemented | Count per agent |
| **CMAs completed** | CMAS_2026 tab | ✅ Implemented | Filtered by "complete" status |
| **Lead source** | Column 25 (Lead Generated) | ✅ Implemented | Raw source preserved |
| **Source flags** | Derived from lead source + Personal Sphere column | ✅ Implemented | isZillow, isRedfin, isSphere, isReferral |
| **Agent income** | Column 22 | ✅ Implemented | For both closed and pending |
| **Haven income (GCI)** | Column 20 | ✅ Implemented | |
| **Epique income** | Column 23 | ✅ Implemented | |
| **Referral fee** | Column 18 | ✅ Implemented | |
| **B&O tax** | Column 19 | ✅ Implemented | |

### Fields NOT Currently in Sheet

| Field | Required By | Status | Action Needed |
|-------|-------------|--------|---------------|
| **Weekly showings count** | Requirement #1 | ❌ Missing | New column needed |
| **Offers written (not accepted)** | Requirement #2, #3 | ❌ Missing | New column needed |
| **Offers accepted** | Requirement #4 (gap analysis) | ❌ Missing | New column needed |
| **CMA done** | Requirement #4 | ⚠️ Partial | CMAS_2026 exists but needs "done" vs "taken" distinction |
| **Listing taken** | Requirement #4 | ⚠️ Partial | Listings tab exists but needs "taken" date/status |
| **Listing sold** | Requirement #4 | ✅ Derived | Can be derived from closed transactions with side='seller' |
| **Showings average before offer** | Requirement #4 | ❌ Missing | Requires showings + offers written linkage |

---

## 3. Proposed New Columns for Transaction Sheet

**Add to Haven Transactions 2026 (Master tabs) - Human-Friendly Names:**

### For Gap Analysis Metrics

| Column Name | Type | Description | Example Values |
|-------------|------|-------------|----------------|
| `Showings Count` | Number | Total showings conducted for this property before offer | 5, 12, 0 |
| `Offers Written` | Number | Number of offers written by agent for this buyer client | 1, 3, 7 |
| `Offers Accepted` | Number | Number of offers written that were accepted by sellers | 0, 1, 2 |
| `CMA Status` | Text | CMA completion status for listing-related deals | Done, Not Done, N/A |
| `Listing Taken Date` | Date | Date listing agreement was signed (for seller leads) | 2026-03-15 |
| `Listing Sold Date` | Date | Date listing closed/sold (auto from CLOSING if side=list) | 2026-04-20 |

### For Activity Tracking (Separate Weekly Activity Tab Recommended)

**Alternative:** Create a new tab `Weekly Activity by Agent` with:

| Column | Type | Description |
|--------|------|-------------|
| `Week Starting` | Date | Monday date for the week |
| `Agent` | Text | Agent name |
| `Total Showings` | Number | Sum of all showings that week |
| `New Listings Taken` | Number | New listing agreements signed |
| `CMAs Completed` | Number | CMAs delivered |
| `Offers Written` | Number | Total offers written |
| `Offers Accepted` | Number | Offers that went under contract |

**Recommendation:** Use separate weekly activity tab for cleaner data model. Transaction sheet stays transaction-focused; activity sheet tracks weekly effort.

---

## 4. Data Model for Gap Analysis Metrics

### Source-Backed vs Manual-Input Fields

#### SOURCE-BACKED (Auto-calculated from transaction/activity sheets)

| Metric | Formula | Source |
|--------|---------|--------|
| **Leads** | COUNT(Lead Generated) WHERE date in range | Master tabs, column 25 |
| **Closed** | COUNT(status='closed') | Master Closed 2026 |
| **Listings Taken** | COUNT(Listing Taken Date) WHERE date in range | New column or Listings tab |
| **Listings Sold** | COUNT(status='closed' AND side='seller') | Master Closed 2026 |
| **CMAs Done** | COUNT(CMA Status='Done') OR COUNT from CMAS_2026 | CMAS_2026 tab or new column |
| **Showings Total** | SUM(Showings Count) | New column or Weekly Activity tab |
| **Offers Written** | SUM(Offers Written) | New column or Weekly Activity tab |
| **Offers Accepted** | SUM(Offers Accepted) | New column or Weekly Activity tab |

#### MANUAL-INPUT (Not derivable from transaction data)

| Metric | Reason | Collection Method |
|--------|--------|-------------------|
| **Sphere work** | Requires categorization beyond Personal Sphere flag | Manual tag or CRM integration |
| **Showings per lead** | Requires linking showings to specific leads | Weekly Activity tab |
| **Showings before offer** | Requires temporal linkage | Calculated: AVG(Showings Count) for deals with Offers Accepted > 0 |

### Gap Analysis Metrics (Requirement #4)

| Gap Metric | Formula | Data Sources |
|------------|---------|--------------|
| **Leads vs Closed** | Closed / Leads | Lead Generated column + closed count |
| **Sphere work** | COUNT(Personal Sphere='Yes' OR isSphere=true) | Column 14 + derived flag |
| **Offers Written vs Accepted** | Offers Accepted / Offers Written | New columns |
| **CMAs Done vs Listings Taken** | Listings Taken / CMAs Done | CMAS_2026 + new column |
| **Listings Taken vs Sold** | Listings Sold / Listings Taken | Derived from closed + new column |
| **Showings Avg Before Offer** | AVG(Showings Count) WHERE Offers Accepted > 0 | New columns |

---

## 5. Source Normalization Rules (Requirement #6)

### Current Implementation (from google-sheets-loader.ts)

```typescript
const isZillow = leadSource.toLowerCase().includes('zillow');
const isRedfin = leadSource.toLowerCase().includes('redfin');
const isSphere = isPersonalSphere || leadSource.toLowerCase().includes('sphere');
```

### Proposed Normalization Function

**Add to `/lib/normalizer.ts` or create `/lib/source-normalizer.ts`:**

```typescript
export function normalizeSourceCategory(
  rawSource: string,
  personalSphereFlag: boolean = false
): 'Zillow' | 'Sphere' | 'Company Generated' | 'Other' {
  const source = (rawSource || '').toLowerCase().trim();
  
  // Rule 1: Zillow takes priority
  if (source.includes('zillow')) {
    return 'Zillow';
  }
  
  // Rule 2: Sphere uses Personal Sphere column OR source contains 'sphere'
  if (personalSphereFlag || source.includes('sphere')) {
    return 'Sphere';
  }
  
  // Rule 3: Company Generated (explicit list + catch-all)
  const companyGeneratedKeywords = [
    'website',
    'homes.com',
    'lofty',
    'call in',
    'call-in',
    'callin',
    'office call',
    'floor time',
    'brokerage',
    'company website',
    'haven website',
  ];
  
  if (companyGeneratedKeywords.some(kw => source.includes(kw))) {
    return 'Company Generated';
  }
  
  // Rule 4: Other (preserves raw source for manual review)
  return 'Other';
}
```

### Example Mappings

| Raw Source Label | Personal Sphere Column | Normalized Category |
|------------------|------------------------|---------------------|
| `Zillow` | No | Zillow |
| `Zillow Flex` | No | Zillow |
| `zillow premier agent` | No | Zillow |
| `(empty)` | Yes | Sphere |
| `Sphere` | No | Sphere |
| `Personal referral` | Yes | Sphere |
| `website` | No | Company Generated |
| `Homes.com` | No | Company Generated |
| `Lofty` | No | Company Generated |
| `Call in` | No | Company Generated |
| `Redfin` | No | Other |
| `Realtor.com` | No | Other |
| `Facebook` | No | Other |
| `Friend referral` | No | Other |

### Display Rule

**For UI display ( Requirement #6):**
- Show normalized category (Zillow / Sphere / Company Generated / Other)
- **Preserve raw source** in a separate field for reporting and debugging
- Do NOT overwrite raw source - keep both values

---

## 6. UI Placement Recommendations (Requirement #5)

### Current UI Structure

- **Agent View:** `/agent/[id]/page.tsx` - Personal dashboard with tabs (Overview, Weekly Activity, Results & Pay)
- **Admin View:** `/admin/closings/page.tsx`, `/admin/pendings/page.tsx` - Full team data

### Recommended Placement

#### For AGENTS (Privacy-Preserving)

**Location:** Agent dashboard → New "Gap Analysis" tab or section within "Weekly Activity" tab

**What agents see:**
- Their own gap metrics only
- Showings count (their own)
- Offers written/accepted (their own)
- Personal conversion rates

**What agents DO NOT see:**
- Other agents' gap metrics
- Team-wide averages (unless explicitly desired)

**Mock placement:**
```
Agent Dashboard Tabs:
[Overview] [Weekly Activity] [Gap Analysis] [Results & Pay]

Gap Analysis Tab:
├── Your Conversion Funnels
│   ├── Leads → Closed: X% (this week/month)
│   ├── CMAs Done → Listings Taken: X%
│   ├── Listings Taken → Sold: X%
│   └── Offers Written → Accepted: X%
├── Your Activity Efficiency
│   ├── Avg Showings Before Offer: X.X
│   └── Weekly Showings: XX
└── Your Lead Sources
    ├── Zillow: X leads, Y% conversion
    ├── Sphere: X leads, Y% conversion
    ├── Company Generated: X leads, Y% conversion
    └── Other: X leads, Y% conversion
```

#### For ADMINS (Full Visibility)

**Location:** Admin dashboard → New "Gap Analysis" page or section

**What admins see:**
- All agent gap metrics
- Team averages and benchmarks
- Leaderboards for gap metrics (top converters, most efficient, etc.)
- Source breakdown with normalized categories

**Mock placement:**
```
Admin Dashboard:
├── Team Gap Analysis Overview
│   ├── Team-wide conversion rates (all funnels)
│   └── Benchmarks vs individual performance
├── Agent Comparison (Table)
│   ├── Agent name | Leads→Closed | CMA→Listing | Listing→Sold | Offers→Accepted | Avg Showings
│   └── [sortable columns]
├── Source Effectiveness
│   ├── Zillow: X leads, Y% avg conversion, $Z cost per closed
│   ├── Sphere: X leads, Y% avg conversion
│   ├── Company Generated: X leads, Y% avg conversion
│   └── Other: X leads, Y% avg conversion
└── Trends Over Time
    ├── Weekly showings per agent
    └── Offers written vs accepted trend
```

### Privacy Considerations

1. **Agent view is strictly personal** - No peer comparison unless explicitly enabled
2. **Admin view has full visibility** - Needed for coaching and performance management
3. **Source data preserved** - Raw source always available for audit, normalized category for display
4. **Weekly showings** - Consider whether this is personal-only or team-visible (recommend: personal-only by default)

---

## 7. Files Inspected

| File Path | Purpose | Lines |
|-----------|---------|-------|
| `/lib/google-sheets-loader.ts` | Primary Google Sheets data loader | 880 |
| `/lib/snapshot.ts` | Snapshot schema definitions | 220 |
| `/lib/normalizer.ts` | Data normalization (upload-based) | 390 |
| `/app/agent/[id]/page.tsx` | Agent dashboard UI | 850 |
| `/app/admin/closings/page.tsx` | Admin closings view | 280 |
| `/app/api/admin-data/route.ts` | Admin data API endpoint | 240 |

---

## 8. Implementation Checklist (Next Build Steps)

### Phase 1: Schema Updates
- [ ] Add new columns to Google Sheets (Showings Count, Offers Written, Offers Accepted, CMA Status, Listing Taken Date)
- [ ] OR create new `Weekly Activity by Agent` tab with weekly aggregated data
- [ ] Update `AgentSnapshot` interface in `/lib/snapshot.ts` to include new fields:
  - `weeklyShowings?: number`
  - `offersWritten?: number`
  - `offersAccepted?: number`
  - `cmasDone?: number`
  - `listingsTaken?: number`
  - `listingsSold?: number`

### Phase 2: Loader Updates
- [ ] Update `/lib/google-sheets-loader.ts` to read new columns/tabs
- [ ] Add source normalization function (create `/lib/source-normalizer.ts`)
- [ ] Update `TransactionRecord` interface to include new fields
- [ ] Preserve raw source + add normalized category field

### Phase 3: Gap Analysis Calculations
- [ ] Add gap metric calculations (conversion rates, averages)
- [ ] Create time-window aggregations (weekly, monthly, YTD)
- [ ] Add team stats for gap metrics

### Phase 4: UI Implementation
- [ ] Add Gap Analysis tab to agent dashboard
- [ ] Add Gap Analysis page to admin dashboard
- [ ] Implement source breakdown visualizations
- [ ] Add conversion funnel visuals

### Phase 5: Testing & Validation
- [ ] Test with sample data including new columns
- [ ] Verify source normalization edge cases
- [ ] Validate privacy boundaries (agent vs admin views)
- [ ] Performance test with full dataset

---

## 9. Anti-Patterns to Avoid (From Requirements)

- ✅ **Do NOT invent fields** - Only propose fields that can be source-backed or explicitly marked as manual-input
- ✅ **Preserve raw source labels** - Never overwrite; add normalized category as separate field
- ✅ **No production changes** - This is audit-only; no commits, deploys, or sheet modifications
- ✅ **No credential exposure** - All inspection from repo files only

---

## 10. Summary

**Current State:**
- Transaction data model is solid with closed/pending tracking
- Income breakdown (agent/Haven/Epique) is implemented
- Source flags (Zillow, Redfin, Sphere) exist but normalization is ad-hoc
- Activity metrics (showings, offers) are NOT tracked

**Gaps Identified:**
1. No showings tracking
2. No offers written/accepted tracking
3. No gap analysis metrics (conversion rates, efficiency ratios)
4. Source normalization is incomplete (missing Company Generated category)

**Recommended Approach:**
1. Add weekly activity tab (cleaner than overloading transaction sheet)
2. Implement source normalization with preserved raw values
3. Build gap analysis as separate UI section (agent-personal + admin-full views)
4. Phase implementation to allow testing at each stage

**Estimated Effort:**
- Schema + Loader: 4-6 hours
- Gap calculations: 2-3 hours
- UI implementation: 6-8 hours
- Testing + validation: 2-3 hours
- **Total: 14-20 hours**

---

**Audit Complete. Ready for build planning.**
