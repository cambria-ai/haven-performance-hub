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
  AlertTriangle,
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
    <main className="relative min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      {/* Decorative orbs */}
      <div className="absolute -left-32 top-32 h-96 w-96 rounded-full bg-indigo-400/15 blur-3xl" />
      <div className="absolute -right-32 bottom-32 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        {/* Left side - Value proposition */}
        <section className="space-y-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
            <Sparkles className="h-4 w-4" />
            Performance dashboards for Haven Real Estate Group
          </div>

          {/* Headline section */}
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">
              Haven Performance Hub
            </p>
            <h1 className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              Clean numbers,
              <br />
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent">clear wins.</span>
            </h1>
            <p className="max-w-xl text-lg leading-7 text-slate-600">
              Upload Excel reports, surface what matters fast, and give every agent a polished view of their
              progress, production, and opportunities.
            </p>
          </div>

          {/* Feature badges */}
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

          {/* Bottom CTA card */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-indigo-600">Built for busy agents and leadership</p>
                <h2 className="mt-1.5 text-xl font-semibold text-slate-900">Less spreadsheet fatigue, more clarity.</h2>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
                Lead sources, Zillow performance, financials, and activity in one place.
              </div>
            </div>
          </div>
        </section>

        {/* Right side - Login form */}
        <section className="relative">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-900/10 sm:p-10">
            {/* Form header */}
            <div className="mb-8">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 shadow-lg shadow-indigo-500/25">
                <Lock className="h-6 w-6 text-white" />
              </div>
              <p className="text-sm font-medium text-indigo-600">Secure login</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-900">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sign in to your personalized Haven dashboard.
              </p>
            </div>

            {/* Login form */}
            <form onSubmit={handleLogin} className="space-y-5">
              <Field
                label="Agent ID"
                placeholder="Enter your agent ID"
                value={agentId}
                onChange={setAgentId}
                type="text"
                autoComplete="username"
              />
              <Field
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="current-password"
              />

              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{loading ? 'Signing in...' : 'Sign in to dashboard'}</span>
                {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
              </button>
            </form>

            {/* Help text */}
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
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
  autoComplete,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
        placeholder={placeholder}
        autoComplete={autoComplete}
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
    <div className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-600 transition-colors group-hover:bg-indigo-100">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
