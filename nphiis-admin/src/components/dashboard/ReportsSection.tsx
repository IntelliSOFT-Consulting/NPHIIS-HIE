'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import SupersetDashboard from '../SupersetDashboard';

interface ReportTab {
  id: 'vhf' | 'vhf_contacts' | 'idsr_cbs' | 'afp';
  label: string;
  dashboardId: string;
  feature: 'REPORTS_VIEW_IDSR' | 'VHF_REPORTS' | 'VHF_CONTACTS';
}

const SUPERSET_URL = process.env.NEXT_PUBLIC_SUPERSET_URL ?? '';

const IDSR_CBS_DASHBOARD_ID =
  process.env.NEXT_PUBLIC_SUPERSET_DASHBOARD_IDSR_CBS ??
  'bb0e334e-e0cb-4def-ac48-3f681cc4d3f4';

const AFP_DASHBOARD_ID = process.env.NEXT_PUBLIC_SUPERSET_DASHBOARD_AFP ?? '';

// Embed ids fixed by the Superset setup (NPHIIS-superset/docker/nphiis-analytics).
const VHF_DASHBOARD_ID =
  process.env.NEXT_PUBLIC_SUPERSET_DASHBOARD_VHF ?? 'f7c7ba20-bbfb-57f8-ab96-a7e44eb07da7';
const VHF_CONTACTS_DASHBOARD_ID =
  process.env.NEXT_PUBLIC_SUPERSET_DASHBOARD_VHF_CONTACTS ?? '5f9bceb6-0753-5dd0-8217-7f78abdad7a1';

interface ReportsSectionProps {
  title?: string;
  subtitle?: string;
  height?: string;
}

// Reusable reports block for dashboards: the VHF dashboards first, then IDSR
// Case-Based Surveillance (which contains the MOH 503 / MOH 502 tabs) and AFP. Renders
// nothing when the user has no report access, so panels can drop it in
// unconditionally.
export default function ReportsSection({
  title = 'Reports',
  subtitle = 'VHF, IDSR Case-Based Surveillance and AFP dashboards',
  height = '70vh',
}: ReportsSectionProps) {
  const { can } = useAuth();

  const tabs = useMemo<ReportTab[]>(
    () => [
      {
        id: 'vhf',
        label: 'VHF / Ebola Surveillance',
        dashboardId: VHF_DASHBOARD_ID,
        feature: 'VHF_REPORTS',
      },
      {
        id: 'vhf_contacts',
        label: 'VHF Contact Tracing',
        dashboardId: VHF_CONTACTS_DASHBOARD_ID,
        feature: 'VHF_CONTACTS',
      },
      {
        id: 'idsr_cbs',
        label: 'IDSR Case-Based Surveillance',
        dashboardId: IDSR_CBS_DASHBOARD_ID,
        feature: 'REPORTS_VIEW_IDSR',
      },
      {
        id: 'afp',
        label: 'AFP Surveillance',
        dashboardId: AFP_DASHBOARD_ID,
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
      {(title || subtitle) && (
        <div className="flex items-center justify-between">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-nphi-900">{title}</h3>
            )}
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
      )}

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

      <div className="card overflow-hidden">
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
