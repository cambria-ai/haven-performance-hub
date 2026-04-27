/**
 * Snapshot storage and management for Haven Performance Hub v1.
 * Provides durable weekly snapshot storage with metadata and history tracking.
 */

import * as fs from 'fs';
import * as path from 'path';

export const CAP_MAX = 20000; // Maximum cap contribution per agent
export const CAP_YEAR_START_MONTH = 3; // April (0-indexed)
export const CAP_YEAR_START_DAY = 7; // April 7th

/**
 * Get the current cap year start date based on April 7th reset.
 * Cap year runs from April 7 of year Y to April 6 of year Y+1.
 * If today is before April 7, we're in the cap year that started last year.
 */
export function getCurrentCapYearStart(): Date {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Check if we're past April 7th this year
  const april7ThisYear = new Date(currentYear, CAP_YEAR_START_MONTH, CAP_YEAR_START_DAY);
  
  if (now >= april7ThisYear) {
    // We're in the cap year starting April 7, currentYear
    return april7ThisYear;
  } else {
    // We're before April 7, so we're in the cap year that started last year
    return new Date(currentYear - 1, CAP_YEAR_START_MONTH, CAP_YEAR_START_DAY);
  }
}

/**
 * Check if a transaction date falls within the current cap year.
 */
export function isInCurrentCapYear(date: Date): boolean {
  const capYearStart = getCurrentCapYearStart();
  const capYearEnd = new Date(capYearStart);
  capYearEnd.setFullYear(capYearEnd.getFullYear() + 1);
  
  return date >= capYearStart && date < capYearEnd;
}

export interface SnapshotMetadata {
  id: string;
  createdAt: string;
  uploadedBy: string;
  sourceFiles: string[];
  agentCount: number;
  transactionCount: number;
  weekStart: string;
  weekEnd: string;
  notes?: string;
}

export interface WeeklySnapshot {
  metadata: SnapshotMetadata;
  agents: Record<string, AgentSnapshot>;
  leaderboard: LeaderboardEntry[];
  teamStats: TeamStats;
}

export interface AgentSnapshot {
  id: string;
  name: string;
  closedTransactions: number;
  closedVolume: number;
  pendingTransactions: number;
  pendingVolume: number;
  activeListings: number;
  cmasCompleted: number;
  zillowLeads: number;
  zillowConversion: number | null;
  zillowCost: number | null;
  gci: number;
  capProgress: number;
  capContributingTransactions?: CapContribution[];
  referrals?: number;
  referralVolume?: number;
  referralTransactions?: ReferralTransaction[];
  pendingTransactionsDetail?: PendingTransactionDetail[];
}

export interface CapContribution {
  transactionId: string;
  address: string;
  closedDate?: string;
  contractDate?: string;
  purchasePrice: number;
  capContribution: number;
  isSphere: boolean;
  notes?: string;
}

export interface ReferralTransaction {
  transactionId: string;
  address: string;
  closedDate?: string;
  purchasePrice: number;
  referralFee?: number;
  referralSource: string;
  isZillowFlex?: boolean;
  isRedfin?: boolean;
  isSphere?: boolean;
}

export interface PendingTransactionDetail {
  transactionId: string;
  address: string;
  contractDate?: string;
  expectedClosingDate?: string;
  purchasePrice: number;
  expectedAgentIncome: number;
  sourceIncomeField: 'Agent Income' | 'Personal Sphere' | 'Haven Income';
  incomeBreakdown?: {
    agentIncome: number;
    personalSphere?: number;
    havenIncome?: number;
  };
  leadSource?: string;
  isSphere?: boolean;
  isZillow?: boolean;
}

export interface TransactionRecord {
  id: string;
  address: string;
  status: 'closed' | 'pending' | 'rescinded';
  side: 'buyer' | 'seller' | 'both';
  closedDate?: string;
  contractDate?: string;
  price: number;
  gci: number;
  leadSource: string;
  isZillow: boolean;
  isSphere?: boolean;
  capContribution?: number;
  agentId: string;
  agentName: string;
  // Referral tracking
  isReferral?: boolean;
  referralSource?: string;
  referralFee?: number;
  isZillowFlex?: boolean;
  isRedfin?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName: string;
  closedTransactions: number;
  closedVolume: number;
  pendingTransactions: number;
  gci: number;
  capProgress: number;
  referrals?: number;
  referralVolume?: number;
}

export interface TeamStats {
  totalAgents: number;
  totalClosedTransactions: number;
  totalClosedVolume: number;
  totalPendingTransactions: number;
  totalPendingVolume: number;
  totalActiveListings: number;
  totalCmasCompleted: number;
  avgZillowConversion: number;
  totalZillowLeads: number;
  totalZillowCost: number;
  totalCapContributions: number;
  totalGCI?: number;
  totalReferrals?: number;
  totalReferralVolume?: number;
}

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'snapshots');
const CURRENT_SNAPSHOT_PATH = path.join(SNAPSHOTS_DIR, 'current.json');
const HISTORY_PATH = path.join(SNAPSHOTS_DIR, 'history.json');

export function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

export function loadCurrentSnapshot(): WeeklySnapshot | null {
  try {
    if (!fs.existsSync(CURRENT_SNAPSHOT_PATH)) {
      return null;
    }
    const data = fs.readFileSync(CURRENT_SNAPSHOT_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load current snapshot:', error);
    return null;
  }
}

export function saveCurrentSnapshot(snapshot: WeeklySnapshot) {
  ensureSnapshotDir();
  
  // Save as current
  fs.writeFileSync(CURRENT_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  
  // Add to history
  let history: SnapshotMetadata[] = [];
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
    }
  } catch {
    history = [];
  }
  
  history.push(snapshot.metadata);
  history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

export function getSnapshotHistory(): SnapshotMetadata[] {
  try {
    if (!fs.existsSync(HISTORY_PATH)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export function loadSnapshotById(snapshotId: string): WeeklySnapshot | null {
  const snapshotPath = path.join(SNAPSHOTS_DIR, `${snapshotId}.json`);
  try {
    if (!fs.existsSync(snapshotPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function archiveCurrentSnapshot(): string | null {
  const current = loadCurrentSnapshot();
  if (!current) return null;
  
  const archivePath = path.join(SNAPSHOTS_DIR, `${current.metadata.id}.json`);
  fs.writeFileSync(archivePath, JSON.stringify(current, null, 2));
  
  return current.metadata.id;
}

/**
 * Generate a unique snapshot ID based on timestamp
 */
export function generateSnapshotId(): string {
  const now = new Date();
  return `snapshot-${now.toISOString().replace(/[:.]/g, '-').split('T')[0]}-${now.getHours()}-${now.getMinutes()}`;
}

/**
 * Get the week start and end dates for a given date
 */
export function getWeekDates(date: Date = new Date()): { weekStart: string; weekEnd: string } {
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  
  const weekStart = new Date(current.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}
