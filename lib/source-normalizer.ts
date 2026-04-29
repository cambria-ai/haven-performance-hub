/**
 * Source normalization for Haven lead sources.
 * 
 * Normalizes raw lead source labels into four categories:
 * - Zillow: Any Zillow variant (Zillow, Zillow Flex, Zillow Premier Agent, etc.)
 * - Sphere: Personal Sphere column = Yes OR source contains "sphere"
 * - Company Generated: Explicit list of Haven-generated leads
 * - Other: Everything else (preserved for manual review)
 * 
 * ALWAYS preserves raw source - normalized category is additive, not replacing.
 */

export type SourceCategory = 'Zillow' | 'Sphere' | 'Company Generated' | 'Other';

/**
 * Company Generated lead source keywords.
 * These indicate leads generated directly by Haven's own efforts.
 */
const COMPANY_GENERATED_KEYWORDS = [
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

/**
 * Normalize a lead source into one of four categories.
 * 
 * Priority order:
 * 1. Zillow (takes priority over everything)
 * 2. Sphere (Personal Sphere flag OR source contains "sphere")
 * 3. Company Generated (explicit keyword list)
 * 4. Other (catch-all, preserves raw source for review)
 * 
 * @param rawSource - The raw lead source label from the sheet
 * @param personalSphereFlag - Whether the Personal Sphere column is "Yes"
 * @returns Normalized category
 */
export function normalizeSourceCategory(
  rawSource: string,
  personalSphereFlag: boolean = false
): SourceCategory {
  const source = (rawSource || '').toLowerCase().trim();
  
  // Rule 1: Zillow takes priority
  if (source.includes('zillow')) {
    return 'Zillow';
  }
  
  // Rule 2: Sphere uses Personal Sphere column OR source contains 'sphere'
  if (personalSphereFlag || source.includes('sphere')) {
    return 'Sphere';
  }
  
  // Rule 3: Company Generated (explicit list)
  if (COMPANY_GENERATED_KEYWORDS.some(kw => source.includes(kw))) {
    return 'Company Generated';
  }
  
  // Rule 4: Other (preserves raw source for manual review)
  return 'Other';
}

/**
 * Get the list of company generated keywords for reference/display.
 */
export function getCompanyGeneratedKeywords(): string[] {
  return [...COMPANY_GENERATED_KEYWORDS];
}

/**
 * Check if a raw source matches a specific category.
 * Useful for filtering without full normalization.
 */
export function isSourceCategory(
  rawSource: string,
  personalSphereFlag: boolean,
  category: SourceCategory
): boolean {
  return normalizeSourceCategory(rawSource, personalSphereFlag) === category;
}

/**
 * Batch normalize multiple sources.
 * More efficient for processing arrays of transactions.
 */
export function batchNormalizeSources(
  sources: Array<{ rawSource: string; personalSphereFlag?: boolean }>
): SourceCategory[] {
  return sources.map(s => normalizeSourceCategory(s.rawSource, s.personalSphereFlag || false));
}
