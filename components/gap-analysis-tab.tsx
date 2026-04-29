/**
 * Gap Analysis Tab Component for Agent Dashboard
 * Shows personal gap metrics, source breakdown, and conversion funnels.
 * Handles missing data gracefully with "not tracked yet" states.
 */

import {
  Target,
  Users,
  TrendingUp,
  Home,
  CheckCircle2,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import {
  calculateGapMetrics,
  formatPercentage,
  getGapDataStatus,
  hasGapMetrics,
} from '@/lib/gap-metrics';

interface GapAnalysisTabProps {
  agentData: {
    id: string;
    name: string;
    closedTransactions: number;
    cmasCompleted?: number;
    activeListings?: number;
    leadSourcesByCategory?: {
      zillow: number;
      sphere: number;
      companyGenerated: number;
      other: number;
    };
  };
}

export default function GapAnalysisTab({ agentData }: GapAnalysisTabProps) {
  // Calculate gap metrics from available data
  const totalLeads = agentData.leadSourcesByCategory
    ? agentData.leadSourcesByCategory.zillow +
      agentData.leadSourcesByCategory.sphere +
      agentData.leadSourcesByCategory.companyGenerated +
      agentData.leadSourcesByCategory.other
    : 0;

  const metrics = calculateGapMetrics({
    totalLeads: totalLeads || undefined,
    closedTransactions: agentData.closedTransactions,
    sphereDeals: agentData.leadSourcesByCategory?.sphere,
  });

  const status = getGapDataStatus(metrics);

  return (
    <div className="space-y-8">
      {/* Status Banner */}
      {status.status !== 'available' && (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50/85 p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="mt-1 h-6 w-6 text-amber-600" />
            <div>
              <h3 className="text-lg font-semibold text-amber-900">
                {status.status === 'not-tracked'
                  ? 'Activity Tracking Not Yet Enabled'
                  : 'Partial Data Available'}
              </h3>
              <p className="mt-2 text-sm text-amber-800">{status.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Your Conversion Funnels */}
      <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            Performance Intelligence
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            Your conversion funnels
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FunnelCard
            label="Leads to Closed"
            value={formatPercentage(metrics.leadsToClosed)}
            numerator={agentData.closedTransactions}
            denominator={totalLeads}
            icon={<Target className="h-5 w-5" />}
            accent="indigo"
          />
          <FunnelCard
            label="Sphere Deals"
            value={(agentData.leadSourcesByCategory?.sphere || 0).toString()}
            numerator={agentData.leadSourcesByCategory?.sphere}
            denominator={undefined}
            icon={<Users className="h-5 w-5" />}
            accent="emerald"
            isCount
          />
          <FunnelCard
            label="CMAs Completed"
            value={(agentData.cmasCompleted || 0).toString()}
            numerator={agentData.cmasCompleted}
            denominator={undefined}
            icon={<Home className="h-5 w-5" />}
            accent="amber"
            isCount
          />
        </div>
      </section>

      {/* Your Lead Sources */}
      {agentData.leadSourcesByCategory && (
        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Lead Generation
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Your lead sources
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Breakdown of where your leads come from
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SourceCard
              label="Zillow"
              count={agentData.leadSourcesByCategory.zillow}
              total={totalLeads}
              color="indigo"
            />
            <SourceCard
              label="Sphere"
              count={agentData.leadSourcesByCategory.sphere}
              total={totalLeads}
              color="emerald"
            />
            <SourceCard
              label="Company Generated"
              count={agentData.leadSourcesByCategory.companyGenerated}
              total={totalLeads}
              color="amber"
            />
            <SourceCard
              label="Other"
              count={agentData.leadSourcesByCategory.other}
              total={totalLeads}
              color="slate"
            />
          </div>

          {/* Source breakdown bar */}
          {totalLeads > 0 && (
            <div className="mt-6">
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-indigo-500 transition-all"
                  style={{
                    width: `${(agentData.leadSourcesByCategory.zillow / totalLeads) * 100}%`,
                  }}
                />
                <div
                  className="bg-emerald-500 transition-all"
                  style={{
                    width: `${(agentData.leadSourcesByCategory.sphere / totalLeads) * 100}%`,
                  }}
                />
                <div
                  className="bg-amber-500 transition-all"
                  style={{
                    width: `${(agentData.leadSourcesByCategory.companyGenerated / totalLeads) * 100}%`,
                  }}
                />
                <div
                  className="bg-slate-400 transition-all"
                  style={{
                    width: `${(agentData.leadSourcesByCategory.other / totalLeads) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-indigo-500" />
                  <span>Zillow ({Math.round((agentData.leadSourcesByCategory.zillow / totalLeads) * 100)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span>Sphere ({Math.round((agentData.leadSourcesByCategory.sphere / totalLeads) * 100)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span>Company ({Math.round((agentData.leadSourcesByCategory.companyGenerated / totalLeads) * 100)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-slate-400" />
                  <span>Other ({Math.round((agentData.leadSourcesByCategory.other / totalLeads) * 100)}%)</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Coming Soon Section */}
      <section className="rounded-[2rem] border border-slate-200 bg-slate-50/85 p-6">
        <div className="flex items-start gap-4">
          <BarChart3 className="mt-1 h-6 w-6 text-slate-400" />
          <div>
            <h3 className="text-lg font-semibold text-slate-700">
              Coming in Phase 1
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              The following metrics will be added once weekly activity tracking is enabled:
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
                Weekly showings per agent
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
                Offers written vs accepted
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
                CMA to listing taken conversion
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
                Average showings before offer
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function FunnelCard({
  label,
  value,
  numerator,
  denominator,
  icon,
  accent,
  isCount = false,
}: {
  label: string;
  value: string;
  numerator?: number;
  denominator?: number;
  icon: React.ReactNode;
  accent: 'indigo' | 'emerald' | 'amber';
  isCount?: boolean;
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
      {!isCount && numerator != null && denominator != null && (
        <p className="mt-1 text-sm text-slate-500">
          {numerator} of {denominator}
        </p>
      )}
    </div>
  );
}

function SourceCard({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: 'indigo' | 'emerald' | 'amber' | 'slate';
}) {
  const colors = {
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  };

  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[color]}`}>
          {percentage}%
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-950">{count}</p>
      <p className="mt-1 text-sm text-slate-500">of {total} total leads</p>
    </div>
  );
}
