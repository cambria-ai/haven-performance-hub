'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [agentId, setAgentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('haven_token', data.token);
      localStorage.setItem('haven_agent', JSON.stringify(data.agent));

      if (data.agent.role === 'admin') {
        router.push('/dashboard');
      } else {
        router.push(`/agent/${data.agent.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(20,184,166,0.2),_transparent_28%),linear-gradient(160deg,_#020617_0%,_#0f172a_55%,_#111827_100%)]" />
      <div className="absolute left-10 top-16 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="absolute bottom-12 right-10 h-52 w-52 rounded-full bg-cyan-400/20 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-slate-200 backdrop-blur">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Performance dashboards for Haven Real Estate Group
          </div>

          <div className="max-w-2xl space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/90">
              Haven Performance Hub
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Clean numbers, clear wins, and a dashboard that actually feels motivating.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-slate-300">
              Upload Excel reports, surface what matters fast, and give every agent a polished view of their
              progress, production, and opportunities.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureBadge
              icon={<BarChart3 className="h-5 w-5" />}
              title="Visual first"
              description="Charts and scorecards that read at a glance."
            />
            <FeatureBadge
              icon={<Target className="h-5 w-5" />}
              title="Goal focused"
              description="Progress is framed against real targets."
            />
            <FeatureBadge
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Private access"
              description="Each agent sees only their own view."
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/8 p-6 backdrop-blur-xl shadow-2xl shadow-slate-950/30">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-300">Built for busy agents and leadership</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Less spreadsheet fatigue, more clarity.</h2>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <TrendingUp className="h-5 w-5 text-emerald-300" />
                Lead sources, Zillow performance, financials, and activity in one place.
              </div>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/20 via-white/5 to-transparent blur-2xl" />
          <div className="relative rounded-[2rem] border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-cyan-300">Secure login</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Sign in to your personalized Haven dashboard.
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30">
                <Lock className="h-6 w-6 text-white" />
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <Field
                label="Agent ID"
                placeholder="Enter your agent ID"
                value={agentId}
                onChange={setAgentId}
                type="text"
              />
              <Field
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={setPassword}
                type="password"
              />

              {error && (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{loading ? 'Signing in...' : 'Sign in to dashboard'}</span>
                {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
              Need access? Your team leader can create and manage credentials for each agent.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
        placeholder={placeholder}
        required
      />
    </label>
  );
}

function FeatureBadge({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
      <div className="mb-3 inline-flex rounded-2xl bg-white/12 p-3 text-cyan-300">{icon}</div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}
