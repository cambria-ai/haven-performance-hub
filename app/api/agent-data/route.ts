import { NextRequest, NextResponse } from 'next/server';
import { loadCurrentSnapshot } from '@/lib/snapshot';
import { getAuthFromRequest, getScopedSnapshotData } from '@/lib/auth-helpers';
import * as fs from 'fs';
import * as path from 'path';

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

    const requestedAgentId = request.nextUrl.searchParams.get('agentId')?.trim() || null;
    const snapshot = loadCurrentSnapshot();

    if (auth.role === 'admin') {
      const targetAgentId = requestedAgentId || auth.agentId;
      const agentData = snapshot?.agents?.[targetAgentId] || null;

      if (!agentData) {
        return NextResponse.json(
          {
            error: 'Agent not found in current snapshot',
            agent: null,
            leaderboard: snapshot?.leaderboard || [],
            teamStats: snapshot?.teamStats || null,
            isAdmin: true,
            snapshotDate: snapshot?.metadata.createdAt || null,
            timeWindowStats: null,
          },
          { status: 404 }
        );
      }

      // Add rank to agent data from leaderboard
      const leaderboardEntry = snapshot?.leaderboard?.find(l => l.agentId === targetAgentId);
      const agentDataWithRank = leaderboardEntry ? { ...agentData, rank: leaderboardEntry.rank } : agentData;

      let agentTimeWindowStats: any = null;
      try {
        const statsPath = path.join(process.cwd(), 'data', 'snapshots', 'time-window-stats.json');
        if (fs.existsSync(statsPath)) {
          const allStats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
          agentTimeWindowStats = allStats[targetAgentId] || null;
        }
      } catch {
        // Time-window stats not available
      }

      // Mark the target agent's leaderboard entry
      const leaderboard = (snapshot?.leaderboard || []).map(entry => ({
        ...entry,
        isOwn: entry.agentId === targetAgentId,
      }));

      return NextResponse.json({
        agent: agentDataWithRank,
        leaderboard,
        teamStats: snapshot?.teamStats || null,
        isAdmin: true,
        snapshotDate: snapshot?.metadata.createdAt || null,
        timeWindowStats: agentTimeWindowStats,
      });
    }

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
    
    // Add rank to agent data from leaderboard
    const leaderboard = (scopedData.leaderboard || []).map(entry => ({
      ...entry,
      isOwn: entry.agentId === auth.agentId,
    }));
    const leaderboardEntry = leaderboard.find(l => l.agentId === auth.agentId);
    const agentDataWithRank = leaderboardEntry ? { ...agentData, rank: leaderboardEntry.rank } : agentData;
    
    // Load time-window stats for this agent
    let agentTimeWindowStats: any = null;
    try {
      const statsPath = path.join(process.cwd(), 'data', 'snapshots', 'time-window-stats.json');
      if (fs.existsSync(statsPath)) {
        const allStats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
        agentTimeWindowStats = allStats[auth.agentId] || null;
      }
    } catch {
      // Time-window stats not available
    }
    
    return NextResponse.json({
      agent: agentDataWithRank,
      leaderboard,
      teamStats: scopedData.teamStats,
      isAdmin: scopedData.isAdmin,
      snapshotDate: scopedData.snapshot?.metadata.createdAt || null,
      timeWindowStats: agentTimeWindowStats,
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
