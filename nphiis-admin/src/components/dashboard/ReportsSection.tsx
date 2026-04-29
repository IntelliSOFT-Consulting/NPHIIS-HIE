'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import SupersetDashboard from '../SupersetDashboard';

interface ReportTab {
  id: 'idsr_cbs';
  label: string;
  dashboardId: string;
  feature: 'REPORTS_VIEW_IDSR';
}

const SUPERSET_URL = process.env.NEXT_PUBLIC_SUPERSET_URL ?? '';

const IDSR_CBS_DASHBOARD_ID =
  process.env.NEXT_PUBLIC_SUPERSET_DASHBOARD_IDSR_CBS ??
  '363e13a5-bfd4-4ca9-b76e-ba284d5b6404';

interface ReportsSectionProps {
  title?: string;
  subtitle?: string;
  height?: string;
}

// Reusable reports block for dashboards. The IDSR Case-Based Surveillance
// dashboard already contains MOH 503 / MOH 502 (AFP, Measles) tabs
// internally, so we only render that single embedded entry here. Renders
// nothing when the user has no report access, so panels can drop it in
// unconditionally.
export default function ReportsSection({
  title = 'Reports',
  subtitle = 'IDSR Case-Based Surveillance — MOH 503 and MOH 502 forms',
  height = '70vh',
}: ReportsSectionProps) {
  const { can } = useAuth();

  const tabs = useMemo<ReportTab[]>(
    () => [
      {
        id: 'idsr_cbs',
        label: 'IDSR Case-Based Surveillance',
        dashboardId: IDSR_CBS_DASHBOARD_ID,
        feature: 'REPORTS_VIEW_IDSR',
      },
    ],
    [],
  );

  const visible = tabs.filter((t) => can(t.feature) && t.dashboardId);
  const [active, setActive] = useState<string | null>(visible[0]?.id ?? null);

  if (visible.length === 0) return null;

  if (!SUPERSET_URL) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        Superset URL is not configured. Set <code>NEXT_PUBLIC_SUPERSET_URL</code> to
        enable embedded reports.
      </div>
    );
  }

  const activeTab = visible.find((t) => t.id === active) ?? visible[0];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-nphi-900">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      {visible.length > 1 && (
        <div className="border-b border-nphi-100/60">
          <nav className="-mb-px flex gap-6" aria-label="Reports">
            {visible.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  tab.id === activeTab.id
                    ? 'border-nphi-600 text-nphi-700'
                    : 'border-transparent text-gray-500 hover:text-nphi-700 hover:border-nphi-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="card p-2">
        <SupersetDashboard
          key={activeTab.id}
          dashboardId={activeTab.dashboardId}
          supersetUrl={SUPERSET_URL}
          height={height}
        />
      </div>
    </section>
  );
}
