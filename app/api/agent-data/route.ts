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

      // Build closed transactions by source for admin view (full details)
      const closedBySource: Record<string, any> = {};
      if (agentData.closedTransactionsDetail && Array.isArray(agentData.closedTransactionsDetail)) {
        for (const txn of agentData.closedTransactionsDetail) {
          const source = txn.leadSource || 'Unknown';
          if (!closedBySource[source]) {
            closedBySource[source] = {
              source,
              count: 0,
              volume: 0,
              gci: 0,
              agentIncome: 0,
              havenIncome: 0,
              transactions: [],
            };
          }
          closedBySource[source].count++;
          closedBySource[source].volume += txn.purchasePrice || 0;
          closedBySource[source].gci += txn.incomeBreakdown?.havenIncome || 0;
          closedBySource[source].agentIncome += txn.incomeBreakdown?.agentIncome || 0;
          closedBySource[source].havenIncome += txn.incomeBreakdown?.havenIncome || 0;
          closedBySource[source].transactions.push({
            transactionId: txn.transactionId,
            address: txn.address,
            closedDate: txn.closedDate,
            purchasePrice: txn.purchasePrice || 0,
            havenIncome: txn.incomeBreakdown?.havenIncome || 0,
            agentIncome: txn.incomeBreakdown?.agentIncome || 0,
            commissionPercent: txn.commissionPercent || null,
            leadSource: source,
          });
        }
      }
      const closedTransactionsBySource = Object.values(closedBySource).sort((a: any, b: any) => b.volume - a.volume);

      return NextResponse.json({
        agent: agentDataWithRank,
        leaderboard,
        teamStats: snapshot?.teamStats || null,
        isAdmin: true,
        snapshotDate: snapshot?.metadata.createdAt || null,
        timeWindowStats: agentTimeWindowStats,
        closedTransactionsBySource,
      });
    }

    if (requestedAgentId && requestedAgentId !== auth.agentId) {
      return NextResponse.json(
        { error: 'You can only view your own dashboard' },
        { status: 403 }
      );
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

    if (!agentData) {
      return NextResponse.json(
        {
          error: 'Agent data not found',
          agent: null,
          leaderboard: scopedData.leaderboard,
        },
        { status: 404 }
      );
    }

    // Add rank to agent data from leaderboard
    const leaderboard = (scopedData.leaderboard || []).map((entry: any) => ({
      ...entry,
      isOwn: entry.agentId === auth.agentId,
    }));
    const leaderboardEntry = leaderboard.find((l: any) => l.agentId === auth.agentId);
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

    // Build pending transactions by source for agent view (privacy-respecting)
    const pendingBySource: Record<string, any> = {};
    if (agentData && agentData.pendingTransactionsDetail && Array.isArray(agentData.pendingTransactionsDetail)) {
      for (const txn of agentData.pendingTransactionsDetail) {
        const source = txn.leadSource || 'Unknown';
        if (!pendingBySource[source]) {
          pendingBySource[source] = {
            source,
            count: 0,
            volume: 0,
            havenIncome: 0,
            agentIncome: 0,
            transactions: [],
          };
        }
        pendingBySource[source].count++;
        pendingBySource[source].volume += txn.purchasePrice || 0;
        pendingBySource[source].havenIncome += txn.incomeBreakdown?.havenIncome || 0;
        pendingBySource[source].agentIncome += txn.expectedAgentIncome || 0;
        // For agents, include minimal transaction details (no agent names for privacy)
        pendingBySource[source].transactions.push({
          transactionId: txn.transactionId,
          address: txn.address,
          contractDate: txn.contractDate,
          expectedClosingDate: txn.expectedClosingDate,
          purchasePrice: txn.purchasePrice || 0,
          havenIncome: txn.incomeBreakdown?.havenIncome || 0,
          expectedAgentIncome: txn.expectedAgentIncome || 0,
          commissionPercent: txn.commissionPercent || null,
        });
      }
    }
    const pendingTransactionsBySource = Object.values(pendingBySource).sort((a: any, b: any) => b.volume - a.volume);

    // Build closed transactions by source for agent view (privacy-respecting)
    const closedBySource: Record<string, any> = {};
    if (agentData && agentData.closedTransactionsDetail && Array.isArray(agentData.closedTransactionsDetail)) {
      for (const txn of agentData.closedTransactionsDetail) {
        const source = txn.leadSource || 'Unknown';
        if (!closedBySource[source]) {
          closedBySource[source] = {
            source,
            count: 0,
            volume: 0,
            gci: 0,
            agentIncome: 0,
            havenIncome: 0,
            transactions: [],
          };
        }
        closedBySource[source].count++;
        closedBySource[source].volume += txn.purchasePrice || 0;
        closedBySource[source].gci += txn.incomeBreakdown?.havenIncome || 0;
        closedBySource[source].agentIncome += txn.incomeBreakdown?.agentIncome || 0;
        closedBySource[source].havenIncome += txn.incomeBreakdown?.havenIncome || 0;
        // For agents, include minimal transaction details (no agent names for privacy)
        closedBySource[source].transactions.push({
          transactionId: txn.transactionId,
          address: txn.address,
          closedDate: txn.closedDate,
          purchasePrice: txn.purchasePrice || 0,
          havenIncome: txn.incomeBreakdown?.havenIncome || 0,
          agentIncome: txn.incomeBreakdown?.agentIncome || 0,
          commissionPercent: txn.commissionPercent || null,
        });
      }
    }
    const closedTransactionsBySource = Object.values(closedBySource).sort((a: any, b: any) => b.volume - a.volume);

    return NextResponse.json({
      agent: agentDataWithRank,
      leaderboard,
      teamStats: scopedData.teamStats,
      isAdmin: scopedData.isAdmin,
      snapshotDate: scopedData.snapshot?.metadata.createdAt || null,
      timeWindowStats: agentTimeWindowStats,
      pendingTransactionsBySource,
      closedTransactionsBySource,
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
