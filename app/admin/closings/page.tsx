'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, DollarSign, Calendar, Home, Tag, TrendingUp, Users } from 'lucide-react';

interface ClosedTransaction {
  transactionId: string;
  agentId: string;
  agentName: string;
  address: string;
  closedDate: string;
  contractDate?: string;
  purchasePrice: number;
  agentIncome: number;
  epiqueIncome?: number;
  commissionPercent?: string | null;
  havenIncome: number;
  boTax: number;
  transactionFee: number;
  leadSource?: string;
  isSphere?: boolean;
  isZillow?: boolean;
  isRedfin?: boolean;
  incomeBreakdown?: {
    agentIncome: number;
    personalSphere: number;
    havenIncome: number;
    epiqueIncome?: number;
  };
}

interface AdminData {
  allClosedTransactions: ClosedTransaction[];
  closedTransactionsBySource: {
    source: string;
    count: number;
    volume: number;
    gci: number;
    agentIncome: number;
    havenIncome: number;
    transactions: Array<{
      transactionId: string;
      agentId: string;
      agentName: string;
      address: string;
      closedDate: string;
      purchasePrice: number;
      havenIncome: number;
      agentIncome: number;
      commissionPercent?: string | null;
      leadSource: string;
    }>;
  }[];
  closedStats: {
    totalClosedVolume: number;
    totalClosedCount: number;
    totalClosedHavenIncome: number;
  };
}

export default function AdminClosingsPage() {
  const router = useRouter();
  
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem('haven_token');
        const agent = localStorage.getItem('haven_agent');
        
        if (!token || !agent) {
          router.push('/');
          return;
        }

        const agentData = JSON.parse(agent);
        if (agentData.role !== 'admin') {
          router.push('/');
          return;
        }

        const res = await fetch('/api/admin-data', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            router.push('/');
            return;
          }
          throw new Error('Failed to load admin data');
        }

        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading closed transactions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <p className="text-lg font-medium text-red-400">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 text-indigo-400 hover:text-indigo-300"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const transactions = data?.allClosedTransactions || [];
  const stats = data?.closedStats || { totalClosedVolume: 0, totalClosedCount: 0, totalClosedHavenIncome: 0 };
  const avgClosePrice = stats.totalClosedCount > 0 ? stats.totalClosedVolume / stats.totalClosedCount : 0;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_38%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="group flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur transition hover:bg-white/80"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to dashboard
          </button>
          <div className="flex-1" />
          <div className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
            Admin - All Closed Transactions
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-3">
                <Home className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Closed</p>
                <p className="text-2xl font-semibold text-slate-950">{stats.totalClosedCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-cyan-100 p-3">
                <DollarSign className="h-5 w-5 text-cyan-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Volume</p>
                <p className="text-2xl font-semibold text-slate-950">{formatCurrency(stats.totalClosedVolume)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-indigo-100 p-3">
                <TrendingUp className="h-5 w-5 text-indigo-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Haven Income (GCI)</p>
                <p className="text-2xl font-semibold text-slate-950">{formatCurrency(stats.totalClosedHavenIncome)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-3">
                <Calendar className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg Close Price</p>
                <p className="text-2xl font-semibold text-slate-950">{formatCurrency(avgClosePrice)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Source Breakdown */}
        {data?.closedTransactionsBySource && data.closedTransactionsBySource.length > 0 && (
          <div className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <h2 className="mb-6 text-xl font-semibold text-slate-950">Closed Transactions by Source</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.closedTransactionsBySource.map((sourceData) => (
                <button
                  key={sourceData.source}
                  onClick={() => setExpandedSource(expandedSource === sourceData.source ? null : sourceData.source)}
                  className="group flex flex-col items-start gap-3 rounded-2xl border border-slate-200/60 bg-white/60 p-5 text-left transition hover:border-indigo-200 hover:bg-white/80 hover:shadow-lg"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {sourceData.source}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {sourceData.count} transaction{sourceData.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="w-full space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Volume</span>
                      <span className="text-lg font-bold text-slate-950">{formatCurrency(sourceData.volume)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">GCI</span>
                      <span className="text-base font-semibold text-emerald-600">{formatCurrency(sourceData.gci)}</span>
                    </div>
                    {sourceData.agentIncome > 0 && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Agent Income</span>
                        <span className="text-base font-semibold text-indigo-600">{formatCurrency(sourceData.agentIncome)}</span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transaction List */}
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <h2 className="mb-6 text-xl font-semibold text-slate-950">
            {expandedSource ? `Transactions from ${expandedSource}` : 'All Closed Transactions'}
          </h2>
          
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Home className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="text-lg font-medium">No closed transactions yet</p>
              <p className="mt-1 text-sm">Closed deals will appear here once imported</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(expandedSource ? data?.closedTransactionsBySource?.find(s => s.source === expandedSource)?.transactions || [] : transactions).map((txn: any, index) => (
                <div
                  key={txn.transactionId}
                  className="group rounded-2xl border border-slate-200/60 bg-white/60 p-5 transition hover:border-indigo-200 hover:bg-white/80 hover:shadow-lg"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                          {index + 1}
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-950">{txn.address}</h3>
                          <p className="text-sm text-slate-600">{txn.agentName}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 pt-2 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          <span>Closed: {formatDate(txn.closedDate)}</span>
                        </div>
                        {txn.contractDate && (
                          <div className="flex items-center gap-1.5">
                            <Tag className="h-4 w-4 text-slate-400" />
                            <span>Contract: {formatDate(txn.contractDate)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-3">
                        {txn.isSphere && (
                          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
                            Personal Sphere
                          </span>
                        )}
                        {txn.isZillow && (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                            Zillow
                          </span>
                        )}
                        {txn.isRedfin && (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                            Redfin
                          </span>
                        )}
                        {txn.leadSource && !txn.isZillow && !txn.isRedfin && !txn.isSphere && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {txn.leadSource}
                          </span>
                        )}
                        {txn.commissionPercent && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                            {txn.commissionPercent}% commission
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 xl:flex xl:flex-col xl:items-end">
                      <div className="text-right">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Purchase Price</p>
                        <p className="text-xl font-bold text-slate-950">{formatCurrency(txn.purchasePrice)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Haven Income</p>
                        <p className="text-lg font-semibold text-emerald-600">{formatCurrency(txn.havenIncome)}</p>
                      </div>
                      {txn.agentIncome > 0 && (
                        <div className="text-right">
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Agent Income</p>
                          <p className="text-lg font-semibold text-indigo-600">{formatCurrency(txn.agentIncome)}</p>
                        </div>
                      )}
                      {txn.boTax > 0 && (
                        <div className="text-right">
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">B&O Tax</p>
                          <p className="text-sm text-slate-600">{formatCurrency(txn.boTax)}</p>
                        </div>
                      )}
                      {txn.transactionFee > 0 && (
                        <div className="text-right">
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Transaction Fee</p>
                          <p className="text-sm text-slate-600">{formatCurrency(txn.transactionFee)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
