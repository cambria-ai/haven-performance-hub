'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileSpreadsheet,
  LogOut,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  AlertTriangle,
} from 'lucide-react';

interface AdminData {
  snapshot: any;
  history: any[];
  importHealth: {
    lastImport: string | null;
    agentCount: number;
    transactionCount: number;
    sourceFiles: string[];
    warnings: string[];
  };
  teamStats: any;
  leaderboard: any[];
}

export default function TeamLeaderDashboard() {
  const router = useRouter();
  const [agent, setAgent] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('haven_agent');
    const storedToken = localStorage.getItem('haven_token');
    if (!stored || !storedToken) {
      router.push('/');
      return;
    }
    const agentData = JSON.parse(stored);
    if (agentData.role !== 'admin') {
      router.push('/');
      return;
    }
    setAgent(agentData);
    setToken(storedToken);
    loadData(storedToken);
  }, [router]);

  async function loadData(authToken: string) {
    try {
      const res = await fetch('/api/admin-data', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else if (res.status === 403) {
        router.push('/');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setUploading(true);
    setUploadWarnings([]);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await res.json();
      if (res.ok) {
        setUploadWarnings(result.warnings?.map((w: any) => w.message) || []);
        loadData(token);
        alert(`✅ Upload successful! Processed ${result.sheets?.length || 0} sheets. ${result.agentCount} agents, ${result.transactionCount} transactions.`);
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (err) {
      alert('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleLogout() {
    localStorage.removeItem('haven_token');
    localStorage.removeItem('haven_agent');
    router.push('/');
  }

  const uploads = data?.history || [];
  const totalAgents = data?.snapshot?.metadata?.agentCount || 0;
  const totalTransactions = data?.snapshot?.metadata?.transactionCount || 0;
  const importHealth = data?.importHealth;

  if (!agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_38%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.28)] backdrop-blur xl:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
                <Sparkles className="h-4 w-4" />
                Team leader command center
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25">
                  <BarChart3 className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Haven Performance Hub</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Welcome back, {agent.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                    Your clean overview for uploads, team visibility, and the metrics that move production.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <div className="font-semibold">{importHealth?.lastImport ? 'Data connected' : 'Ready for first upload'}</div>
                <div className="mt-1 text-emerald-700/80">
                  {importHealth?.lastImport
                    ? `Last import: ${formatDate(importHealth.lastImport)}`
                    : 'Upload an Excel or CSV report to populate the dashboards.'}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        </header>

        <section className="mb-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-[0_35px_90px_-40px_rgba(15,23,42,0.8)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(96,165,250,0.38),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(45,212,191,0.24),_transparent_30%)]" />
            <div className="relative flex h-full flex-col justify-between gap-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200">
                  <FileSpreadsheet className="h-4 w-4" />
                  Upload center
                </div>
                <div>
                  <h2 className="text-3xl font-semibold sm:text-4xl">Drop in the next report file and let the dashboard do the heavy lifting.</h2>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
                    Excel and CSV uploads are supported for opportunities, activities, GCI, Zillow stats, and financial breakdowns.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid gap-4 sm:grid-cols-2">
                  <QuickChip icon={<Shield className="h-4 w-4" />} label="Private agent views" />
                  <QuickChip icon={<TrendingUp className="h-4 w-4" />} label="Goal driven reporting" />
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50">
                  <Upload className="h-5 w-5" />
                  <span>{uploading ? 'Uploading...' : 'Upload report file'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv"
                    onChange={handleUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <InsightPanel
              title="Recent activity"
              value={uploads.length ? `${uploads.length} snapshot${uploads.length === 1 ? '' : 's'}` : 'No snapshots yet'}
              note={importHealth?.lastImport ? `Latest snapshot: ${formatDate(importHealth.lastImport)}` : 'Your first upload will kick off the dashboard data feed.'}
              icon={<Clock3 className="h-5 w-5" />}
              tone="slate"
            />
            <InsightPanel
              title="Agent coverage"
              value={totalAgents ? `${totalAgents} tracked` : 'Waiting for report data'}
              note={totalAgents ? 'Agent pages will reflect production once reports are loaded.' : 'No agent metrics have been parsed yet.'}
              icon={<Users className="h-5 w-5" />}
              tone="indigo"
            />
            <InsightPanel
              title="Team pulse"
              value="4%+ Zillow goal"
              note="The visual layout is tuned to keep team benchmarks front and center."
              icon={<Target className="h-5 w-5" />}
              tone="emerald"
            />
          </div>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total agents"
            value={totalAgents}
            helper={totalAgents ? 'Active in current snapshot' : 'Waiting for first import'}
            accent="indigo"
          />
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Closed volume"
            value={formatCurrency(data?.teamStats?.totalClosedVolume || 0)}
            helper={data?.teamStats?.totalClosedVolume ? 'Team production value' : 'Waiting for first import'}
            accent="emerald"
          />
          <StatCard
            icon={<Target className="h-5 w-5" />}
            label="Closed transactions"
            value={data?.teamStats?.totalClosedTransactions || totalTransactions}
            helper={data?.teamStats?.totalClosedTransactions ? 'Across the full team' : 'Waiting for first import'}
            accent="cyan"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Pending deals"
            value={data?.teamStats?.totalPendingTransactions || 0}
            helper={data?.teamStats?.totalPendingTransactions ? 'In-flight across team' : 'Waiting for first import'}
            accent="amber"
          />
        </section>

        <section className="mb-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Team race</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">Agent leaderboard</h3>
                <p className="mt-2 text-sm text-slate-600">Ranked by closed transactions, with volume and pending deals breaking ties.</p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {data?.leaderboard?.length || 0} agents
              </div>
            </div>

            {data?.leaderboard?.length ? (
              <div className="space-y-3">
                {data.leaderboard.map((entry: any) => (
                  <AdminLeaderboardRow key={entry.agentId} entry={entry} />
                ))}
              </div>
            ) : (
              <EmptyCard
                title="No agents in the current snapshot"
                description="Once the weekly import is loaded, the named leaderboard will appear here for leadership."
              />
            )}
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="mb-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Team totals</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">What leadership should see at a glance</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FocusCard title="Pending transactions" description={`${data?.teamStats?.totalPendingTransactions || 0} deals are currently in flight across the team.`} />
              <FocusCard title="Pending volume" description={`${formatCurrency(data?.teamStats?.totalPendingVolume || 0)} in pending transaction volume.`} />
              <FocusCard title="Active listings" description={`${data?.teamStats?.totalActiveListings || 0} listings are currently represented in the live snapshot.`} />
              <FocusCard title="Zillow lead volume" description={`${data?.teamStats?.totalZillowLeads || 0} Zillow leads tracked with conversion health visible below.`} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Import history</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">Snapshot timeline</h3>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {uploads.length} snapshot{uploads.length !== 1 ? 's' : ''}
              </div>
            </div>

            {importHealth?.warnings?.length ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Import warnings</p>
                    <ul className="mt-1 space-y-1 text-sm text-amber-700">
                      {importHealth.warnings.map((warning: string, i: number) => (
                        <li key={i}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            {uploads.length > 0 ? (
              <div className="space-y-4">
                {uploads
                  .slice(-5)
                  .reverse()
                  .map((snapshot: any, i: number) => (
                    <div key={i} className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="truncate text-base font-semibold text-slate-900">
                            {snapshot.id || `Snapshot ${i + 1}`}
                          </p>
                          <span className="text-sm text-slate-500">{formatDate(snapshot.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {snapshot.agentCount} agents, {snapshot.transactionCount} transactions
                          {snapshot.sourceFiles?.length ? ` • ${snapshot.sourceFiles.length} sources` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyCard
                title="No snapshots yet"
                description="Your first weekly import will create the initial snapshot and populate all dashboards."
              />
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Benchmarks</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">Team standards that stay visible</h3>
                </div>
                <ArrowUpRight className="h-5 w-5 text-slate-400" />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <BenchmarkCard
                  label="Standard Zillow conversion"
                  value="4%+"
                  description="Preferred benchmark for healthy online lead performance."
                  accent="indigo"
                />
                <BenchmarkCard
                  label="Top agent range"
                  value="3 to 5%"
                  description="Strong online conversion when follow up is consistent."
                  accent="emerald"
                />
                <BenchmarkCard
                  label="Speed to lead"
                  value="5 min"
                  description="Fast response dramatically increases connection odds."
                  accent="amber"
                />
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">What this dashboard highlights</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FocusCard title="Lead source accountability" description="Separate company provided leads from sphere and personal business so performance stays honest." />
                <FocusCard title="Agent motivation" description="Every view is designed to feel encouraging, not clinical, while still keeping the numbers clear." />
                <FocusCard title="Financial transparency" description="Show cap, Haven fees, taxes, transaction costs, and Zillow spend in one readable flow." />
                <FocusCard title="Team level visibility" description="Leadership can track momentum, uploads, and benchmarks from one polished control center." />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/10 px-3 py-2 text-sm text-slate-100 backdrop-blur">
      <span className="text-cyan-300">{icon}</span>
      {label}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  helper,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  helper: string;
  accent: 'indigo' | 'emerald' | 'amber' | 'cyan';
}) {
  const accents = {
    indigo: 'from-indigo-500/15 to-violet-500/10 text-indigo-700',
    emerald: 'from-emerald-500/15 to-teal-500/10 text-emerald-700',
    amber: 'from-amber-500/15 to-orange-500/10 text-amber-700',
    cyan: 'from-cyan-500/15 to-sky-500/10 text-cyan-700',
  };

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.28)] backdrop-blur">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[accent]}`}>
          {icon}
        </div>
        <div className="h-2 w-20 rounded-full bg-slate-100">
          <div className="h-2 w-12 rounded-full bg-slate-900/75" />
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function InsightPanel({
  title,
  value,
  note,
  icon,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  tone: 'slate' | 'indigo' | 'emerald';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.26)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</div>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{note}</p>
    </div>
  );
}

function BenchmarkCard({
  label,
  value,
  description,
  accent,
}: {
  label: string;
  value: string;
  description: string;
  accent: 'indigo' | 'emerald' | 'amber';
}) {
  const accents = {
    indigo: 'text-indigo-700 bg-indigo-50 border-indigo-100',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    amber: 'text-amber-700 bg-amber-50 border-amber-100',
  };

  return (
    <div className={`rounded-3xl border p-5 ${accents[accent]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-3 text-sm leading-6 opacity-80">{description}</p>
    </div>
  );
}

function FocusCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-5">
      <h4 className="text-base font-semibold text-slate-900">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function AdminLeaderboardRow({ entry }: { entry: any }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
      <div className="flex items-center gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
          entry.rank === 1 ? 'bg-amber-100 text-amber-700' :
          entry.rank === 2 ? 'bg-slate-200 text-slate-700' :
          entry.rank === 3 ? 'bg-orange-100 text-orange-700' :
          'bg-slate-100 text-slate-600'
        }`}>
          {entry.rank}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{entry.agentName}</p>
          <p className="text-xs text-slate-500">{formatCurrency(entry.closedVolume || 0)} • {entry.pendingTransactions || 0} pending</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-slate-950">{entry.closedTransactions}</p>
        <p className="text-xs text-slate-500">closed</p>
      </div>
    </div>
  );
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
      <h4 className="text-lg font-semibold text-slate-900">{title}</h4>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (!value) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
