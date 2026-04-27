/**
 * Auth helpers for role-scoped data access in Haven Performance Hub v1.
 * Ensures agents only see their own data while admins see everything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, findAgent } from './auth';
import { WeeklySnapshot, AgentSnapshot, LeaderboardEntry } from './snapshot';

export interface AuthContext {
  agentId: string;
  name: string;
  role: 'admin' | 'agent';
  isAuthenticated: boolean;
}

export function getAuthFromRequest(request: NextRequest): AuthContext | null {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return null;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }

  const agent = findAgent(decoded.agentId);
  if (!agent) {
    return null;
  }

  return {
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    isAuthenticated: true,
  };
}

/**
 * Get role-scoped snapshot data.
 * - Admins receive full named data
 * - Agents receive only their own detailed data + anonymized leaderboard
 * - Sensitive Haven-side financial fields are removed from non-admin views
 */
export function getScopedSnapshotData(
  snapshot: WeeklySnapshot | null,
  auth: AuthContext
): ScopedAgentData {
  if (!snapshot) {
    return {
      snapshot: null,
      leaderboard: [],
      teamStats: null,
      isAdmin: false,
    };
  }

  if (auth.role === 'admin') {
    // Admin sees everything
    return {
      snapshot,
      leaderboard: snapshot.leaderboard,
      teamStats: snapshot.teamStats,
      isAdmin: true,
    };
  }

  // Agent sees only their own data + anonymized leaderboard
  const agentData = snapshot.agents[auth.agentId];

  if (!agentData) {
    // Agent not found in snapshot - return empty state
    return {
      snapshot: null,
      leaderboard: anonymizeLeaderboard(snapshot.leaderboard, auth.agentId),
      teamStats: snapshot.teamStats,
      isAdmin: false,
      error: 'Agent not found in current snapshot',
    };
  }

  // Sanitize agent data to remove sensitive Haven-side fields
  const sanitizedAgentData = sanitizeAgentData(agentData, false);
  const sanitizedLeaderboard = sanitizeLeaderboard(snapshot.leaderboard, auth.agentId, false);

  return {
    snapshot: {
      ...snapshot,
      agents: {
        [auth.agentId]: sanitizedAgentData,
      },
    },
    leaderboard: sanitizedLeaderboard,
    teamStats: snapshot.teamStats,
    isAdmin: false,
  };
}

export function validateAgentAccess(
  auth: AuthContext,
  requestedAgentId: string
): boolean {
  // Admins can access any agent's data
  if (auth.role === 'admin') {
    return true;
  }

  // Agents can only access their own data
  return auth.agentId === requestedAgentId;
}

export interface ScopedAgentData {
  snapshot: WeeklySnapshot | null;
  leaderboard: LeaderboardEntry[];
  teamStats: any;
  isAdmin: boolean;
  error?: string;
}

/**
 * Anonymize leaderboard for agent view.
 * Shows own name, anonymizes all others.
 */
function anonymizeLeaderboard(
  leaderboard: LeaderboardEntry[],
  currentAgentId: string
): LeaderboardEntry[] {
  return leaderboard.map(entry => {
    if (entry.agentId === currentAgentId) {
      // Keep own entry as-is
      return {
        ...entry,
        isOwn: true,
      };
    }

    // Anonymize other entries
    return {
      ...entry,
      agentName: `Position ${entry.rank}`,
      agentId: `anon-${entry.rank}`,
      isOwn: false,
    };
  });
}

/**
 * Middleware helper to require auth and return 401 if not authenticated
 */
export function requireAuth(request: NextRequest): {
  auth: AuthContext;
  response?: NextResponse;
} {
  const auth = getAuthFromRequest(request);

  if (!auth) {
    return {
      auth: {
        agentId: '',
        name: '',
        role: 'agent',
        isAuthenticated: false,
      },
      response: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  return { auth };
}

/**
 * Sanitize agent data for non-admin users.
 * Removes sensitive Haven-side financial fields while preserving agent-visible fields.
 *
 * Agents CAN see:
 * - Their own expectedAgentIncome, agentIncome, personalSphere
 * - Cap progress and personal production metrics
 *
 * Agents CANNOT see:
 * - agent.gci (Haven-side GCI)
 * - leaderboard.gci for other agents
 * - pendingTransactionsDetail[].incomeBreakdown.havenIncome
 * - pendingTransactionsDetail[].boTax
 * - pendingTransactionsDetail[].transactionFee
 * - pendingTransactionsDetail[].lniTax
 * - closedTransactionsDetail[].incomeBreakdown.havenIncome
 * - closedTransactionsDetail[].boTax
 * - closedTransactionsDetail[].transactionFee
 */
function sanitizeAgentData(agentData: AgentSnapshot, isAdmin: boolean): AgentSnapshot {
  if (isAdmin || !agentData) {
    return agentData;
  }

  // Create a copy to avoid mutating the original
  const sanitized = { ...agentData };

  // Remove Haven-side GCI (agents see their own production via capProgress, not Haven GCI)
  sanitized.gci = 0;

  // Sanitize pending transactions detail
  if (sanitized.pendingTransactionsDetail) {
    sanitized.pendingTransactionsDetail = sanitized.pendingTransactionsDetail.map(txn => {
      const sanitizedTxn = { ...txn };

      // Remove Haven-side income breakdown
      if (sanitizedTxn.incomeBreakdown) {
        sanitizedTxn.incomeBreakdown = {
          agentIncome: sanitizedTxn.incomeBreakdown.agentIncome || 0,
          personalSphere: sanitizedTxn.incomeBreakdown.personalSphere || 0,
          // Remove havenIncome - agents only see their expectedAgentIncome
        };
      }

      // Remove tax and fee fields
      delete (sanitizedTxn as any).boTax;
      delete (sanitizedTxn as any).transactionFee;
      delete (sanitizedTxn as any).lniTax;

      return sanitizedTxn;
    });
  }

  // Sanitize closed transactions detail
  if (sanitized.closedTransactionsDetail) {
    sanitized.closedTransactionsDetail = sanitized.closedTransactionsDetail.map(txn => {
      const sanitizedTxn = { ...txn };

      // Remove Haven-side income breakdown
      if (sanitizedTxn.incomeBreakdown) {
        sanitizedTxn.incomeBreakdown = {
          agentIncome: sanitizedTxn.incomeBreakdown.agentIncome || 0,
          personalSphere: sanitizedTxn.incomeBreakdown.personalSphere || 0,
          // Remove havenIncome
        };
      }

      // Remove tax and fee fields
      delete (sanitizedTxn as any).boTax;
      delete (sanitizedTxn as any).transactionFee;

      return sanitizedTxn;
    });
  }

  return sanitized;
}

/**
 * Sanitize leaderboard for non-admin users.
 * Removes GCI from other agents' entries.
 */
function sanitizeLeaderboard(leaderboard: LeaderboardEntry[], currentAgentId: string, isAdmin: boolean): LeaderboardEntry[] {
  if (isAdmin) {
    return leaderboard;
  }

  return leaderboard.map(entry => {
    if (entry.agentId === currentAgentId) {
      // Keep own entry with full data (but GCI already 0 from agent sanitization)
      return { ...entry };
    }

    // Remove GCI from anonymized entries
    const { gci, ...rest } = entry;
    return { ...rest, gci: 0 };
  });
}
