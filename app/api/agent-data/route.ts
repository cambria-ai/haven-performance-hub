import { NextRequest, NextResponse } from 'next/server';
import { loadCurrentSnapshot } from '@/lib/snapshot';
import { getAuthFromRequest, getScopedSnapshotData } from '@/lib/auth-helpers';

/**
 * Get agent-specific dashboard data with proper scoping.
 * Agents see only their own data + anonymized leaderboard.
 * Admins see full team data.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const snapshot = loadCurrentSnapshot();
    const scopedData = getScopedSnapshotData(snapshot, auth);
    
    if (!scopedData.snapshot && scopedData.error) {
      return NextResponse.json(
        { 
          error: scopedData.error,
          agent: null,
          leaderboard: scopedData.leaderboard,
        },
        { status: 404 }
      );
    }
    
    // Extract agent data
    const agentData = scopedData.snapshot?.agents[auth.agentId] || null;
    
    return NextResponse.json({
      agent: agentData,
      leaderboard: scopedData.leaderboard,
      teamStats: scopedData.teamStats,
      isAdmin: scopedData.isAdmin,
      snapshotDate: scopedData.snapshot?.metadata.createdAt || null,
    });
  } catch (error) {
    console.error('Agent data error:', error);
    return NextResponse.json({ 
      error: 'Failed to load agent data',
      agent: null,
      leaderboard: [],
    });
  }
}
