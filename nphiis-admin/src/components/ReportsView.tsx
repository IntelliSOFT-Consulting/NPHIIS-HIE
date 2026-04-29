'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import SupersetDashboard from './SupersetDashboard';

interface ReportTab {
  id: 'idsr_cbs';
  label: string;
  dashboardId: string;
  feature: 'REPORTS_VIEW_IDSR';
}

const SUPERSET_URL = process.env.NEXT_PUBLIC_SUPERSET_URL ?? '';

// Embedded dashboard UUIDs (Superset → Settings → Embed dashboard). The env
// var lets each environment override; the literal default keeps the
// out-of-the-box deploy working.
const IDSR_CBS_DASHBOARD_ID =
  process.env.NEXT_PUBLIC_SUPERSET_DASHBOARD_IDSR_CBS ??
  '363e13a5-bfd4-4ca9-b76e-ba284d5b6404';

export default function ReportsView() {
  const { can } = useAuth();

  // Single embedded dashboard; the underlying Superset dashboard contains
  // the MOH 503 + MOH 502 (AFP/Measles) tabs internally so we no longer
  // expose them as separate top-level tabs in the admin.
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

  if (!SUPERSET_URL) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-sm text-yellow-800">
        Superset URL is not configured. Set <code>NEXT_PUBLIC_SUPERSET_URL</code> to
        enable embedded reports.
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600">
          No reports are available for your role yet. Contact an administrator if you
          believe this is incorrect.
        </p>
      </div>
    );
  }

  const activeTab = visible.find((t) => t.id === active) ?? visible[0];

  return (
    <div className="space-y-4">
      {visible.length > 1 && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6" aria-label="Reports">
            {visible.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 text-sm font-medium ${
                  tab.id === activeTab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-2">
        <SupersetDashboard
          key={activeTab.id}
          dashboardId={activeTab.dashboardId}
          supersetUrl={SUPERSET_URL}
        />
      </div>
    </div>
  );
}
