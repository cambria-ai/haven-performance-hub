'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  BarChart3,
  DollarSign,
  Home,
  LogOut,
  Mail,
  Phone,
  PlusCircle,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

interface AgentData {
  agent: any;
  leaderboard: any[];
  teamStats: any;
  isAdmin: boolean;
  snapshotDate: string;
}

export default function AgentDashboard() {
  const router = useRouter();
  const params = useParams();
  const [agent, setAgent] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [data, setData] = useState<AgentData | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [newLead, setNewLead] = useState({ type: 'sphere', name: '', source: '', notes: '' });

  useEffect(() => {
    const stored = localStorage.getItem('haven_agent');
    const storedToken = localStorage.getItem('haven_token');
    if (!stored || !storedToken) {
      router.push('/');
      return;
    }
    const agentData = JSON.parse(stored);
    if (params.id !== agentData.id) {
      router.push('/');
      return;
    }
    setAgent(agentData);
    setToken(storedToken);
    loadData(storedToken);
  }, [router, params.id]);

  async function loadData(authToken: string) {
    try {
      const res = await fetch('/api/agent-data', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else if (res.status === 401 || res.status === 403) {
        router.push('/');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newLead,
          createdAt: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        alert('✅ Lead added!');
        setShowLeadForm(false);
        setNewLead({ type: 'sphere', name: '', source: '', notes: '' });
      } else {
        alert('Failed to add lead');
      }
    } catch (err) {
      alert('Failed to add lead');
    }
  }

  function handleLogout() {
    localStorage.removeItem('haven_token');
    localStorage.removeItem('haven_agent');
    router.push('/');
  }

  if (!agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading dashboard...
      </div>
    );
  }

  const agentData = data?.agent;
  const leaderboard = data?.leaderboard || [];
  const teamStats = data?.teamStats;
  const myRank = leaderboard.find(l => l.isOwn);
  const conversionRate = agentData?.zillowConversion || 0;
  const conversionProgress = Math.min((conversionRate / 4) * 100, 100);
  const [leads, setLeads] = useState<any[]>([]);
  
  const motivationMessage = !agentData
    ? 'Your dashboard is ready and waiting for the next report upload.'
    : conversionRate >= 4
      ? 'You are at or above the Zillow benchmark. Nice work.'
      : conversionRate >= 2.5
        ? 'You are building momentum. A little more follow up can push you over benchmark.'
        : 'You have room to grow here, and this dashboard will help you spot exactly where to focus next.';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef6ff_35%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 text-white shadow-[0_35px_90px_-40px_rgba(15,23,42,0.72)]">
          <div className="relative px-6 py-7 sm:px-8 sm:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.42),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.28),_transparent_30%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-cyan-100 backdrop-blur">
                  <Sparkles className="h-4 w-4" />
                  Your personal performance view
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-white backdrop-blur">
                    <BarChart3 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Haven Performance Hub</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Hi {agent.name}, here is your scoreboard.</h1>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">{motivationMessage}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        </header>

        {agentData ? (
          <>
            <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-4">
              <RankCard
                rank={myRank?.rank || '--'}
                totalAgents={leaderboard.length}
                movement={myRank?.movement || 'same'}
                distanceToNext={myRank?.distanceToNext || 0}
              />
              <StatCard
                icon={<Target className="h-5 w-5" />}
                label="Closed transactions"
                value={agentData.closedTransactions || 0}
                helper="Year to date closings"
                accent="indigo"
              />
              <StatCard
                icon={<DollarSign className="h-5 w-5" />}
                label="Closed volume"
                value={formatCurrency(agentData.closedVolume || 0)}
                helper="Total sales volume"
                accent="emerald"
              />
              <StatCard
                icon={<TrendingUp className="h-5 w-5" />}
                label="Conversion rate"
                value={`${(agentData.zillowConversion || 0).toFixed(1)}%`}
                helper={agentData.zillowConversion >= 4 ? 'On target' : 'Goal is 4%'}
                accent="amber"
              />
            </section>

            <section className="mb-8 grid gap-6 xl:grid-cols-[1fr_380px]">
              <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                <div className="mb-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Team race</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Leaderboard - Closed Transactions</h2>
                  <p className="mt-2 text-sm text-slate-600">You see your position highlighted. Other positions are anonymous to protect privacy.</p>
                </div>

                <div className="space-y-3">
                  {leaderboard.map((entry) => (
                    <LeaderboardRow
                      key={entry.rank}
                      entry={entry}
                      isOwn={entry.isOwn}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Your activity</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Daily effort metrics</h2>

                  <div className="mt-6 space-y-3">
                    <ActivityRow icon={<Phone className="h-4 w-4" />} label="Calls" value={agentData.calls || 0} />
                    <ActivityRow icon={<Home className="h-4 w-4" />} label="Showings" value={agentData.showings || 0} />
                    <ActivityRow icon={<Mail className="h-4 w-4" />} label="Emails" value={agentData.emails || 0} />
                    <ActivityRow icon={<Target className="h-4 w-4" />} label="CMAs completed" value={agentData.cmasCompleted || 0} />
                    <ActivityRow icon={<Trophy className="h-4 w-4" />} label="Active listings" value={agentData.activeListings || 0} />
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Zillow health</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Paid lead performance</h2>

                  <div className="mt-6 space-y-3">
                    <MetricRow label="Lead volume" value={agentData.zillowLeads || 0} />
                    <MetricRow label="Conversion rate" value={`${(agentData.zillowConversion || 0).toFixed(1)}%`} />
                    <MetricRow label="Cost per lead" value={formatCurrency((agentData.zillowCost || 0) / (agentData.zillowLeads || 1))} />
                    <MetricRow label="Total Zillow cost" value={formatCurrency(agentData.zillowCost || 0)} />
                  </div>

                  <div className="mt-6 rounded-3xl bg-slate-50 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Benchmark progress</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">Zillow conversion goal</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${conversionRate >= 4 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {conversionRate >= 4 ? 'On target' : 'In progress'}
                      </span>
                    </div>
                    <div className="mt-4 h-3 rounded-full bg-slate-200">
                      <div
                        className="h-3 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 transition-all"
                        style={{ width: `${Math.max(conversionProgress, 6)}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                      <span>Current: {conversionRate.toFixed(1)}%</span>
                      <span>Goal: 4.0%</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Financial clarity</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Where your money is going</h2>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">Readable at a glance</div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <FinancialItem label="Cap progress" value={`${((agentData.capProgress || 0) / (agentData.capTarget || 1) * 100).toFixed(0)}%`} />
                <FinancialItem label="Haven fees" value={formatCurrency(agentData.havenFees || 0)} />
                <FinancialItem label="B&O tax" value={formatCurrency(agentData.boTax || 0)} />
                <FinancialItem label="L&I" value={formatCurrency(agentData.lni || 0)} />
                <FinancialItem label="Transaction fees" value={formatCurrency(agentData.transactionFees || 0)} />
                <FinancialItem label="Zillow costs" value={formatCurrency(agentData.zillowCost || 0)} />
              </div>
            </section>
          </>
        ) : (
          <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-10 text-center shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-100 text-indigo-700">
              <BarChart3 className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-slate-950">No performance data yet</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
              Your page is ready. As soon as your team leader uploads the next Excel report, your personalized metrics will appear here.
            </p>
          </section>
        )}

        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Lead tracker</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Keep your sphere and floor time leads organized</h2>
            </div>
            <button
              onClick={() => setShowLeadForm(!showLeadForm)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <PlusCircle className="h-4 w-4" />
              {showLeadForm ? 'Close form' : 'Add lead'}
            </button>
          </div>

          {showLeadForm && (
            <form onSubmit={handleAddLead} className="mb-6 rounded-[1.75rem] border border-slate-200 bg-slate-50/90 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select
                  value={newLead.type}
                  onChange={(e) => setNewLead({ ...newLead, type: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="sphere">Sphere / Personal</option>
                  <option value="floor">Floor Time</option>
                </select>
                <input
                  type="text"
                  placeholder="Lead name"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  required
                />
                <input
                  type="text"
                  placeholder="Source"
                  value={newLead.source}
                  onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <input
                  type="text"
                  placeholder="Notes"
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <button
                type="submit"
                className="mt-4 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Save lead
              </button>
            </form>
          )}

          {leads.length > 0 ? (
            <div className="space-y-3">
              {leads.map((lead: any, i: number) => (
                <div key={i} className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{lead.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {lead.type === 'sphere' ? 'Sphere / Personal' : 'Floor Time'}
                      {lead.source ? ` • ${lead.source}` : ''}
                    </p>
                    {lead.notes && <p className="mt-2 text-sm text-slate-600">{lead.notes}</p>}
                  </div>
                  <span className="text-sm text-slate-400">{formatDate(lead.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-3xl bg-slate-50 px-5 py-6 text-center text-sm leading-6 text-slate-500">
              No leads tracked yet. Add your sphere and floor time leads here so they stay organized.
            </p>
          )}
        </section>
      </div>
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
  accent: 'indigo' | 'emerald' | 'amber';
}) {
  const accents = {
    indigo: 'from-indigo-500/15 to-violet-500/10 text-indigo-700',
    emerald: 'from-emerald-500/15 to-teal-500/10 text-emerald-700',
    amber: 'from-amber-500/15 to-orange-500/10 text-amber-700',
  };

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.24)] backdrop-blur">
      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[accent]}`}>
        {icon}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function ActivityCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'indigo' | 'emerald' | 'amber';
}) {
  const accents = {
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/90 p-5">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${accents[accent]}`}>{icon}</div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-base font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function FinancialItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
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
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RankCard({ rank, totalAgents, movement, distanceToNext }: {
  rank: number | string;
  totalAgents: number;
  movement: 'up' | 'down' | 'same' | 'new';
  distanceToNext: number;
}) {
  const movementIcon = movement === 'up' ? (
    <ArrowUpRight className="h-5 w-5 text-emerald-500" />
  ) : movement === 'down' ? (
    <ArrowDownRight className="h-5 w-5 text-rose-500" />
  ) : (
    <Minus className="h-5 w-5 text-slate-400" />
  );

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-cyan-500/10 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Your rank</p>
          <p className="mt-2 text-5xl font-bold text-slate-950">{rank}</p>
          <p className="mt-1 text-sm text-slate-500">of {totalAgents} agents</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {movementIcon}
          {distanceToNext > 0 && (
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {distanceToNext} to next
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({ entry, isOwn }: { entry: any; isOwn: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
      isOwn 
        ? 'border-indigo-200 bg-indigo-50/80' 
        : 'border-slate-100 bg-slate-50/50'
    }`}>
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
          <p className={`font-semibold ${isOwn ? 'text-indigo-900' : 'text-slate-700'}`}>
            {entry.agentName}
            {isOwn && <span className="ml-2 text-xs font-normal text-indigo-600">(You)</span>}
          </p>
          <p className="text-xs text-slate-500">
            {entry.closedVolume ? formatCurrency(entry.closedVolume) : ''}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-slate-900">{entry.closedTransactions}</p>
        <p className="text-xs text-slate-500">closed</p>
      </div>
    </div>
  );
}

function ActivityRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="text-slate-500">{icon}</div>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <span className="text-base font-semibold text-slate-950">{value}</span>
    </div>
  );
}
