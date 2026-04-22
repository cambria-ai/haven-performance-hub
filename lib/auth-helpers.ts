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
 */
export function getScopedSnapshotData(
  snapshot: WeeklySnapshot | null,
  auth: AuthContext
): ScopedSnapshotResponse {
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
  
  return {
    snapshot: {
      ...snapshot,
      agents: {
        [auth.agentId]: agentData,
      },
    },
    leaderboard: anonymizeLeaderboard(snapshot.leaderboard, auth.agentId),
    teamStats: snapshot.teamStats,
    isAdmin: false,
  };
}

export interface ScopedSnapshotResponse {
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
 * Validate that an agent can only access their own data
 */
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
