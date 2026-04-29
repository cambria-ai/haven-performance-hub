/**
 * Gap Analysis Metrics Utilities - Phase 0
 * 
 * Calculates conversion rates and efficiency metrics for gap analysis.
 * Handles missing/zero denominators gracefully - NO NaN, NO Infinity, NO fake data.
 * 
 * Key principle: When data is missing, show "not tracked yet" state, not zeros.
 */

/**
 * Safe division that handles missing/zero denominators.
 * Returns null when calculation is not meaningful (denominator is 0 or undefined).
 * 
 * @param numerator - The numerator value
 * @param denominator - The denominator value
 * @param options - Optional configuration
 * @returns Conversion rate as decimal (0-1) or null if not calculable
 */
export function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  options?: { 
    returnZeroInstead?: boolean; // If true, return 0 instead of null for missing denominator
  }
): number | null {
  if (numerator == null || denominator == null || denominator === 0) {
    return options?.returnZeroInstead ? 0 : null;
  }
  
  const result = numerator / denominator;
  
  // Guard against NaN and Infinity
  if (isNaN(result) || !isFinite(result)) {
    return options?.returnZeroInstead ? 0 : null;
  }
  
  return result;
}

/**
 * Convert decimal to percentage string with formatting.
 * Returns "—" (em dash) when value is null to indicate "not tracked" state.
 * 
 * @param value - Decimal value (0-1) or null
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string or "—" for null
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value == null) {
    return '—';
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Gap Analysis Metrics Interface
 * All fields are optional to support Phase 0 where some metrics aren't tracked yet.
 */
export interface GapMetrics {
  // Lead to Close funnel
  leadsToClosed?: number | null; // Closed / Leads
  // Sphere work
  sphereWork?: number; // Count of sphere deals
  // Offers funnel
  offersWrittenToAccepted?: number | null; // Accepted / Written
  // CMA to Listing funnel
  cmasDoneToListingsTaken?: number | null; // Listings Taken / CMAs Done
  // Listing to Sold funnel
  listingsTakenToSold?: number | null; // Sold / Taken
  // Showings efficiency
  avgShowingsBeforeOffer?: number | null; // AVG(Showings) where Offers Accepted > 0
}

/**
 * Calculate gap metrics for an agent.
 * All metrics handle missing data gracefully.
 * 
 * @param data - Agent data with optional activity fields
 * @returns Gap metrics (null values indicate "not tracked yet")
 */
export function calculateGapMetrics(data: {
  // Lead/source data
  totalLeads?: number;
  closedTransactions?: number;
  sphereDeals?: number;
  
  // Offer data
  offersWritten?: number;
  offersAccepted?: number;
  
  // CMA/Listing data
  cmasDone?: number;
  listingsTaken?: number;
  listingsSold?: number;
  
  // Showings data
  totalShowings?: number;
  dealsWithOffers?: number; // Number of deals that had offers accepted
  
  // Weekly activity fields (Phase 1)
  weeklyShowings?: number;
  weeklyOffersWritten?: number;
  weeklyOffersAccepted?: number;
  weeklyListingsTaken?: number;
  weeklyCmasCompleted?: number;
}): GapMetrics {
  const metrics: GapMetrics = {};
  
  // Leads to Closed conversion
  metrics.leadsToClosed = safeDivide(data.closedTransactions, data.totalLeads);
  
  // Sphere work count (not a rate, just a count)
  metrics.sphereWork = data.sphereDeals || 0;
  
  // Offers Written to Accepted conversion (uses weekly activity if available)
  const offersWritten = data.weeklyOffersWritten ?? data.offersWritten;
  const offersAccepted = data.weeklyOffersAccepted ?? data.offersAccepted;
  metrics.offersWrittenToAccepted = safeDivide(offersAccepted, offersWritten);
  
  // CMA to Listing funnel (uses weekly activity if available)
  const cmasDone = data.weeklyCmasCompleted ?? data.cmasDone;
  const listingsTaken = data.weeklyListingsTaken ?? data.listingsTaken;
  metrics.cmasDoneToListingsTaken = safeDivide(listingsTaken, cmasDone);
  
  // Listing to Sold funnel
  metrics.listingsTakenToSold = safeDivide(data.listingsSold, data.listingsTaken);
  
  // Average Showings Before Offer
  // Only calculable if we have deals with offers accepted
  const totalShowings = data.weeklyShowings ?? data.totalShowings;
  const dealsWithOffers = data.dealsWithOffers ?? (data.weeklyOffersAccepted || 0);
  if (dealsWithOffers && dealsWithOffers > 0 && totalShowings != null) {
    const avg = totalShowings / dealsWithOffers;
    metrics.avgShowingsBeforeOffer = isFinite(avg) && !isNaN(avg) ? avg : null;
  } else {
    metrics.avgShowingsBeforeOffer = null;
  }
  
  return metrics;
}

/**
 * Calculate source breakdown from transactions.
 * Groups transactions by normalized source category.
 * 
 * @param transactions - Array of transactions with sourceCategory field
 * @returns Count by source category
 */
export function calculateSourceBreakdown(
  transactions: Array<{ sourceCategory?: string }>
): {
  zillow: number;
  sphere: number;
  companyGenerated: number;
  other: number;
} {
  const breakdown = {
    zillow: 0,
    sphere: 0,
    companyGenerated: 0,
    other: 0,
  };
  
  for (const txn of transactions) {
    const category = txn.sourceCategory;
    if (!category) {
      breakdown.other++;
      continue;
    }
    
    switch (category) {
      case 'Zillow':
        breakdown.zillow++;
        break;
      case 'Sphere':
        breakdown.sphere++;
        break;
      case 'Company Generated':
        breakdown.companyGenerated++;
        break;
      default:
        breakdown.other++;
    }
  }
  
  return breakdown;
}

/**
 * Check if gap metrics are available or if data is still "not tracked yet".
 * Returns true if at least one meaningful metric can be calculated.
 * 
 * @param metrics - Gap metrics object
 * @returns True if any metrics are available
 */
export function hasGapMetrics(metrics: GapMetrics): boolean {
  return (
    metrics.leadsToClosed != null ||
    metrics.offersWrittenToAccepted != null ||
    metrics.cmasDoneToListingsTaken != null ||
    metrics.listingsTakenToSold != null ||
    metrics.avgShowingsBeforeOffer != null ||
    (metrics.sphereWork != null && metrics.sphereWork > 0)
  );
}

/**
 * Get a status message for gap analysis data availability.
 * Useful for UI display when data is incomplete.
 * 
 * @param metrics - Gap metrics object
 * @returns Status message
 */
export function getGapDataStatus(metrics: GapMetrics): {
  status: 'available' | 'partial' | 'not-tracked';
  message: string;
} {
  const availableCount = [
    metrics.leadsToClosed,
    metrics.offersWrittenToAccepted,
    metrics.cmasDoneToListingsTaken,
    metrics.listingsTakenToSold,
    metrics.avgShowingsBeforeOffer,
  ].filter(v => v != null).length;
  
  if (availableCount === 0) {
    return {
      status: 'not-tracked',
      message: 'Activity tracking not yet enabled. Metrics will appear here once weekly showings and offers are tracked.',
    };
  }
  
  if (availableCount < 5) {
    return {
      status: 'partial',
      message: 'Some metrics are available. Additional metrics will appear as more activity data is tracked.',
    };
  }
  
  return {
    status: 'available',
    message: 'All gap analysis metrics are available.',
  };
}

/**
 * Team-level gap metrics aggregation.
 * Calculates team averages while handling missing data correctly.
 * 
 * @param agentMetrics - Array of per-agent gap metrics
 * @returns Team averages (only includes agents with data for each metric)
 */
export function calculateTeamGapAverages(
  agentMetrics: Array<GapMetrics & { agentId: string; agentName: string }>
): {
  avgLeadsToClosed?: number | null;
  avgOffersWrittenToAccepted?: number | null;
  avgCmasDoneToListingsTaken?: number | null;
  avgListingsTakenToSold?: number | null;
  avgShowingsBeforeOffer?: number | null;
  totalAgents: number;
  agentsWithData: number;
} {
  // Helper to calculate average of non-null values
  const avg = (values: (number | null | undefined)[]): number | null => {
    const valid = values.filter((v): v is number => v != null);
    if (valid.length === 0) return null;
    const sum = valid.reduce((a, b) => a + b, 0);
    const result = sum / valid.length;
    return isFinite(result) && !isNaN(result) ? result : null;
  };
  
  // Count agents with at least one metric
  const agentsWithData = agentMetrics.filter(m => hasGapMetrics(m)).length;
  
  // Calculate averages for each metric
  const avgLeadsToClosed = avg(agentMetrics.map(m => m.leadsToClosed));
  const avgOffersWrittenToAccepted = avg(agentMetrics.map(m => m.offersWrittenToAccepted));
  const avgCmasDoneToListingsTaken = avg(agentMetrics.map(m => m.cmasDoneToListingsTaken));
  const avgListingsTakenToSold = avg(agentMetrics.map(m => m.listingsTakenToSold));
  const avgShowingsBeforeOffer = avg(agentMetrics.map(m => m.avgShowingsBeforeOffer));
  
  return {
    avgLeadsToClosed,
    avgOffersWrittenToAccepted,
    avgCmasDoneToListingsTaken,
    avgListingsTakenToSold,
    avgShowingsBeforeOffer,
    totalAgents: agentMetrics.length,
    agentsWithData,
  };
}
