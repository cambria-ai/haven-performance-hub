/**
 * Referral identification utilities for Haven Performance Hub.
 * Identifies referrals from multiple source indicators in Google Sheets.
 */

import { ReferralTransaction } from './snapshot';

export interface ReferralIndicators {
  isReferral: boolean;
  referralSource: string;
  referralFee?: number;
  isZillowFlex: boolean;
  isRedfin: boolean;
  isSphere: boolean;
}

/**
 * Parse referral indicators from a transaction row.
 */
export function parseReferralIndicators(row: Record<string, any>): ReferralIndicators {
  const leadSource = (row['Lead Generated'] || row['lead source'] || row['Lead Source'] || '') as string;
  const referralText = (row['Referral'] || '') as string;
  const zillowFlexReferral = (row['Zillow Flex Referral'] || '') as string;
  const redfinReferral = (row['Redfin Referral'] || '') as string;
  const personalSphere = (row['Personal Sphere'] || '') as string;

  const isReferral = identifyReferral(leadSource, referralText, zillowFlexReferral, redfinReferral);
  const referralSource = identifyReferralSource(leadSource, zillowFlexReferral, redfinReferral, personalSphere);
  const referralFee = parseCurrency(referralText) || undefined;
  const isZillowFlex: boolean = Boolean(zillowFlexReferral && zillowFlexReferral.trim() !== '' && zillowFlexReferral.trim() !== '$0.00');
  const isRedfin: boolean = Boolean(redfinReferral && redfinReferral.trim() !== '' && redfinReferral.trim() !== '$0.00');
  const isSphere: boolean = Boolean(personalSphere && personalSphere.trim() !== '');

  return {
    isReferral,
    referralSource,
    referralFee,
    isZillowFlex,
    isRedfin,
    isSphere,
  };
}

/**
 * Create a referral transaction record from transaction data.
 */
export function createReferralTransaction(
  transactionId: string,
  address: string,
  closedDate: string | undefined,
  purchasePrice: number,
  indicators: ReferralIndicators
): ReferralTransaction {
  return {
    transactionId,
    address,
    closedDate,
    purchasePrice,
    referralFee: indicators.referralFee,
    referralSource: indicators.referralSource,
    isZillowFlex: indicators.isZillowFlex,
    isRedfin: indicators.isRedfin,
    isSphere: indicators.isSphere,
  };
}

/**
 * Identify if a transaction is a referral based on multiple indicators.
 * CRITICAL: Zillow and Redfin transactions are NEVER referrals per Cambria's rule.
 */
function identifyReferral(
  leadSource: string,
  referralText: string,
  zillowFlexReferral: string,
  redfinReferral: string
): boolean {
  const leadSourceLower = leadSource.toLowerCase();

  // Check if source is Zillow or Redfin - these should NEVER count as referrals
  const isZillowSource = leadSourceLower.includes('zillow');
  const isRedfinSource = leadSourceLower.includes('redfin');

  // Zillow and Redfin are NOT referrals regardless of other indicators
  if (isZillowSource || isRedfinSource) return false;

  // Check Lead Generated column for referral keywords
  const referralKeywords = ['referral', 'soi', 'sphere', 'past client', 'lender referral', 'personal referral'];
  for (const keyword of referralKeywords) {
    if (leadSourceLower.includes(keyword)) return true;
  }

  // Check if Referral column has a dollar amount
  if (referralText && referralText.trim() !== '' && referralText.trim() !== '$0.00') return true;

  // Check Zillow Flex Referral column - but this is already excluded by isZillowSource check above
  // Kept for completeness but won't trigger for Zillow sources
  if (zillowFlexReferral && zillowFlexReferral.trim() !== '' && zillowFlexReferral.trim() !== '$0.00') return true;

  // Check Redfin Referral column - but this is already excluded by isRedfinSource check above
  // Kept for completeness but won't trigger for Redfin sources
  if (redfinReferral && redfinReferral.trim() !== '' && redfinReferral.trim() !== '$0.00') return true;

  return false;
}

/**
 * Identify the referral source type.
 * CRITICAL: Zillow and Redfin are explicitly excluded from referral sources.
 */
function identifyReferralSource(
  leadSource: string,
  zillowFlexReferral: string,
  redfinReferral: string,
  personalSphere: string
): string {
  const leadSourceLower = leadSource.toLowerCase();

  // Check for Zillow/Redfin first - these are NOT referrals
  if (leadSourceLower.includes('zillow')) {
    return 'Zillow';
  }

  if (leadSourceLower.includes('redfin')) {
    return 'Redfin';
  }

  if (zillowFlexReferral && zillowFlexReferral.trim() !== '' && zillowFlexReferral.trim() !== '$0.00') {
    return 'Zillow Flex';
  }

  if (redfinReferral && redfinReferral.trim() !== '' && redfinReferral.trim() !== '$0.00') {
    return 'Redfin';
  }

  if (leadSourceLower.includes('soi')) {
    return 'SOI';
  }

  if (leadSourceLower.includes('sphere') || (personalSphere && personalSphere.trim() !== '')) {
    return 'Sphere';
  }

  if (leadSourceLower.includes('past client')) {
    return 'Past Client';
  }

  if (leadSourceLower.includes('lender')) {
    return 'Lender';
  }

  if (leadSourceLower.includes('prolinc')) {
    return 'PROLINC';
  }

  return 'Other';
}

function parseCurrency(value: any): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}
