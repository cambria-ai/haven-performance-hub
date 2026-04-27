'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, DollarSign, ArrowLeft } from 'lucide-react';

interface PendingTransaction {
  transactionId: string;
  agentId: string;
  agentName: string;
  address: string;
  contractDate?: string;
  expectedClosingDate?: string;
  purchasePrice: number;
  expectedAgentIncome: number;
  havenIncome: number;
  boTax?: number;
  transactionFee?: number;
  leadSource: string;
  isSphere: boolean;
  isZillow: boolean;
  incomeBreakdown?: {
    agentIncome: number;
    personalSphere: number;
    havenIncome: number;
  };
}

interface AdminData {
  allPendingTransactions: PendingTransaction[];
  totalHavenReceivables: number;
  totalAgentReceivables: number;
  totalPurchasePrice: number;
  transactionCount: number;
}

export default function AdminPendingsPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
              <p className="text-lg font-medium text-slate-600">Loading pending transactions...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl bg-red-50 p-6 text-red-800">
            <p className="font-semibold">Error loading data</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Admin View</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950">All Pending Transactions</h1>
              <p className="mt-2 text-slate-600">
                {data.transactionCount} pending deals across the team
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-3">
                <DollarSign className="h-6 w-6 text-emerald-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Haven Receivables</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatCurrency(data.totalHavenReceivables)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-100 p-3">
                <TrendingUp className="h-6 w-6 text-indigo-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Agent Receivables</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatCurrency(data.totalAgentReceivables)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-3">
                <DollarSign className="h-6 w-6 text-slate-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Volume</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatCurrency(data.totalPurchasePrice)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-3">
                <TrendingUp className="h-6 w-6 text-amber-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Transactions</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.transactionCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <h2 className="mb-6 text-xl font-semibold text-slate-950">Pending Transactions by Agent</h2>
          
          {data.allPendingTransactions.length > 0 ? (
            <div className="space-y-6">
              {data.allPendingTransactions.map((txn) => (
                <div
                  key={txn.transactionId}
                  className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-slate-900">{txn.address}</p>
                      <p className="text-sm text-slate-600">
                        <span className="font-medium text-indigo-600">{txn.agentName}</span>
                        {txn.contractDate ? ` • Contract: ${formatDate(txn.contractDate)}` : ''}
                        {txn.expectedClosingDate ? ` • Expected closing: ${formatDate(txn.expectedClosingDate)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-emerald-700">
                        {formatCurrency(txn.expectedAgentIncome)}
                      </p>
                      <p className="text-xs text-slate-500">Agent income</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Income Breakdown
                      </h4>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Agent</span>
                          <span className="font-medium text-slate-900">
                            {formatCurrency(txn.incomeBreakdown?.agentIncome || 0)}
                          </span>
                        </div>
                        {txn.incomeBreakdown?.personalSphere && txn.incomeBreakdown.personalSphere > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Sphere</span>
                            <span className="font-medium text-emerald-700">
                              {formatCurrency(txn.incomeBreakdown.personalSphere)}
                            </span>
                          </div>
                        )}
                        {txn.havenIncome > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Haven (GCI)</span>
                            <span className="font-medium text-slate-900">
                              {formatCurrency(txn.havenIncome)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Fees & Taxes
                      </h4>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">B&O Tax</span>
                          <span className="font-medium text-slate-900">
                            {formatCurrency(txn.boTax || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Transaction Fee</span>
                          <span className="font-medium text-slate-900">
                            {formatCurrency(txn.transactionFee || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Purchase Price</span>
                          <span className="font-medium text-slate-900">
                            {formatCurrency(txn.purchasePrice)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Deal Info
                      </h4>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Lead Source</span>
                          <span className="font-medium text-slate-900">{txn.leadSource || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Deal Type</span>
                          <span className="font-medium text-slate-900">
                            {txn.isSphere ? 'Personal Sphere' : txn.isZillow ? 'Zillow' : 'Other'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(txn.incomeBreakdown?.agentIncome === 0 && txn.incomeBreakdown?.personalSphere === 0 && txn.incomeBreakdown?.havenIncome === 0) && (
                    <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                      <p className="font-medium">Income data not available in source</p>
                      <p className="mt-0.5 text-amber-600">
                        This transaction is tracked but income breakdown has not been entered in Master Haven PNDS yet.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-8 text-center">
              <p className="text-slate-600">No pending transactions found.</p>
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

function formatDate(dateString: string): string {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
