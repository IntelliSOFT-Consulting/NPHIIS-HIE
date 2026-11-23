'use client';

import { useCallback, useState } from 'react';
import { useAuth, useAuthedFetch } from '@/lib/auth-context';
import type { SnapshotSummary } from '@/lib/evd-snapshot';
import { Alert } from '../ui/Alert';
import SupersetDashboard from '../SupersetDashboard';
import EvdSnapshotForm from './EvdSnapshotForm';
import EvdSnapshotSubmissions from './EvdSnapshotSubmissions';

const API = '/api/outbreak-response/evd-snapshot';
const SUPERSET_URL = process.env.NEXT_PUBLIC_SUPERSET_URL ?? '';
// Embed id fixed by NPHIIS-superset/docker/nphiis-analytics/evd_snapshot_setup.py.
const EVD_DASHBOARD_ID =
  process.env.NEXT_PUBLIC_SUPERSET_DASHBOARD_EVD_SNAPSHOT ?? 'd3088997-6780-5c10-b116-1520fcbfaa63';

type Tab = 'submit' | 'submissions' | 'dashboard';

export default function EvdSnapshotView() {
  const authedFetch = useAuthedFetch();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('submit');
  const [editing, setEditing] = useState<SnapshotSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [formKey, setFormKey] = useState(0);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'submit', label: editing ? 'Edit snapshot' : 'Submit snapshot' },
    { id: 'submissions', label: 'Submissions' },
    ...(can('VHF_REPORTS') ? [{ id: 'dashboard' as const, label: 'Dashboard' }] : []),
  ];

  const openForEdit = useCallback(
    async (id: string) => {
      setError(null);
      setNotice(null);
      try {
        const res = await authedFetch(`${API}/${encodeURIComponent(id)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Could not open the snapshot (${res.status})`);
        setEditing(body as SnapshotSummary);
        setTab('submit');
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [authedFetch],
  );

  const onSaved = (message: string) => {
    setNotice(message);
    setEditing(null);
    setFormKey((k) => k + 1); // a clean form for the next one
    setRefreshKey((k) => k + 1);
    setTab('submissions');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-nphi-900">EVD Daily Snapshot</h1>
        <p className="text-sm text-gray-500">
          Sub-county daily enhanced EVD surveillance snapshot. Covers the previous day (00:00–23:59 EAT); submit by 09:00 EAT each day.
        </p>
      </div>

      <div className="border-b border-nphi-100/60">
        <nav className="-mb-px flex gap-6" aria-label="EVD Daily Snapshot">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id === 'submit' && tab !== 'submit') setNotice(null);
              }}
              className={`whitespace-nowrap py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                t.id === tab
                  ? 'border-nphi-600 text-nphi-700'
                  : 'border-transparent text-gray-500 hover:text-nphi-700 hover:border-nphi-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      {tab === 'submit' && (
        <EvdSnapshotForm
          key={editing?.id ?? `new-${formKey}`}
          editing={editing}
          onSaved={onSaved}
          onCancelEdit={() => {
            setEditing(null);
            setTab('submissions');
          }}
        />
      )}
      {tab === 'submissions' && <EvdSnapshotSubmissions refreshKey={refreshKey} onEdit={openForEdit} />}
      {tab === 'dashboard' &&
        (SUPERSET_URL ? (
          <div className="card overflow-hidden">
            <SupersetDashboard dashboardId={EVD_DASHBOARD_ID} supersetUrl={SUPERSET_URL} height="80vh" />
          </div>
        ) : (
          <Alert variant="warning">
            Superset URL is not configured. Set NEXT_PUBLIC_SUPERSET_URL to show the dashboard.
          </Alert>
        ))}
    </div>
  );
}
