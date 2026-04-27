import { NextRequest, NextResponse } from 'next/server';
import { loadCurrentSnapshot, getSnapshotHistory } from '@/lib/snapshot';
import { getAuthFromRequest } from '@/lib/auth-helpers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Admin dashboard data endpoint.
 * Returns full team data, import health, and snapshot history.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const snapshot = loadCurrentSnapshot();
    const history = getSnapshotHistory();

    // Calculate import health
    const importHealth: {
      lastImport: string | null;
      agentCount: number;
      transactionCount: number;
      sourceFiles: string[];
      warnings: string[];
    } = {
      lastImport: snapshot?.metadata.createdAt || null,
      agentCount: snapshot?.metadata.agentCount || 0,
      transactionCount: snapshot?.metadata.transactionCount || 0,
      sourceFiles: snapshot?.metadata.sourceFiles || [],
      warnings: [],
    };

    // Check for stale data (older than 7 days)
    if (snapshot?.metadata.createdAt) {
      const lastImport = new Date(snapshot.metadata.createdAt);
      const daysSinceImport = Math.floor((Date.now() - lastImport.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceImport > 7) {
        importHealth.warnings.push(`Data is ${daysSinceImport} days old. Consider running a weekly import.`);
      }
    } else {
      importHealth.warnings.push('No snapshot data available. Run your first import to populate dashboards.');
    }

    // Load time-window stats if available
    let timeWindowStats: Record<string, any> | null = null;
    try {
      const statsPath = path.join(process.cwd(), 'data', 'snapshots', 'time-window-stats.json');
      if (fs.existsSync(statsPath)) {
        timeWindowStats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      }
    } catch {
      // Time-window stats not available yet
    }

    // Aggregate all pending transactions with full details
    const allPendingTransactions: any[] = [];
    let totalHavenReceivables = 0;
    let totalAgentReceivables = 0;
    let totalPurchasePrice = 0;

    if (snapshot?.agents) {
      for (const agent of Object.values(snapshot.agents)) {
        if (agent.pendingTransactionsDetail && agent.pendingTransactionsDetail.length > 0) {
          for (const txn of agent.pendingTransactionsDetail) {
            allPendingTransactions.push({
              transactionId: txn.transactionId,
              agentId: agent.id,
              agentName: agent.name,
              address: txn.address,
              contractDate: txn.contractDate,
              expectedClosingDate: txn.expectedClosingDate,
              purchasePrice: txn.purchasePrice || 0,
              expectedAgentIncome: txn.expectedAgentIncome || 0,
              havenIncome: txn.incomeBreakdown?.havenIncome || 0,
              boTax: txn.boTax || 0,
              transactionFee: txn.transactionFee || 0,
              leadSource: txn.leadSource || 'Unknown',
              isSphere: txn.isSphere || false,
              isZillow: txn.isZillow || false,

              incomeBreakdown: txn.incomeBreakdown,
            });

            totalHavenReceivables += txn.incomeBreakdown?.havenIncome || 0;
            totalAgentReceivables += txn.expectedAgentIncome || 0;
            totalPurchasePrice += txn.purchasePrice || 0;
          }
        }
      }
    }

    // Aggregate all closed transactions with full details
    const allClosedTransactions: any[] = [];
    let totalClosedVolume = 0;
    let totalClosedCount = 0;
    let totalClosedHavenIncome = 0;

    if (snapshot?.agents) {
      for (const agent of Object.values(snapshot.agents)) {
        if (agent.closedTransactionsDetail && agent.closedTransactionsDetail.length > 0) {
          for (const txn of agent.closedTransactionsDetail) {
            allClosedTransactions.push({
              transactionId: txn.transactionId,
              agentId: agent.id,
              agentName: agent.name,
              address: txn.address,
              closedDate: txn.closedDate,
              contractDate: txn.contractDate,
              purchasePrice: txn.purchasePrice || 0,
              agentIncome: txn.agentIncome || 0,
              havenIncome: txn.incomeBreakdown?.havenIncome || 0,
              boTax: txn.boTax || 0,
              transactionFee: txn.transactionFee || 0,
              leadSource: txn.leadSource || 'Unknown',
              isSphere: txn.isSphere || false,
              isZillow: txn.isZillow || false,
              isRedfin: txn.isRedfin || false,
              incomeBreakdown: txn.incomeBreakdown,
            });

            totalClosedVolume += txn.purchasePrice || 0;
            totalClosedCount += 1;
            totalClosedHavenIncome += txn.incomeBreakdown?.havenIncome || 0;
          }
        }
      }
    }

    return NextResponse.json({
      snapshot,
      history,
      importHealth,
      teamStats: snapshot?.teamStats || null,
      leaderboard: snapshot?.leaderboard || [],
      timeWindowStats,
      allPendingTransactions,
      allClosedTransactions,
      closedStats: {
        totalClosedVolume,
        totalClosedCount,
        totalClosedHavenIncome,
      },
      pendingStats: {
        totalHavenReceivables,
        totalAgentReceivables,
        totalPurchasePrice,
      },
      transactionCount: allPendingTransactions.length,
    });
  } catch (error) {
    console.error('Admin data error:', error);
    return NextResponse.json({
      error: 'Failed to load admin data',
      snapshot: null,
      history: [],
      importHealth: null,
    });
  }
}
