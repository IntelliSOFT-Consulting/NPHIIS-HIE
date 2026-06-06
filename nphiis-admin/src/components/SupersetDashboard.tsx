'use client';

import { useEffect, useRef, useState } from 'react';
import { embedDashboard } from '@superset-ui/embedded-sdk';
import { useAuth } from '@/lib/auth-context';
import Spinner from './ui/Spinner';

interface SupersetDashboardProps {
  dashboardId: string;
  supersetUrl: string;
  height?: string;
}

export default function SupersetDashboard({
  dashboardId,
  supersetUrl,
  height = '80vh',
}: SupersetDashboardProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current || !accessToken || !supersetUrl) return;

    setLoading(true);
    setError(null);
    let cancelled = false;

    const fetchGuestToken = async (): Promise<string> => {
      const res = await fetch('/api/superset/guest-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ dashboardId }),
      });
      if (!res.ok) throw new Error(`Guest token request failed (${res.status})`);
      const data = (await res.json()) as { token: string };
      return data.token;
    };

    embedDashboard({
      id: dashboardId,
      supersetDomain: supersetUrl,
      mountPoint: mountRef.current,
      fetchGuestToken,
      dashboardUiConfig: {
        hideTitle: true,
        hideTab: false,
        hideChartControls: false,
        filters: { expanded: true },
      },
    })
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Superset embed failed:', err);
          setLoading(false);
          setError('Dashboard could not be loaded. Please try refreshing the page.');
        }
      });

    return () => {
      cancelled = true;
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [dashboardId, supersetUrl, accessToken]);

  return (
    <div className="relative" style={{ height, width: '100%' }}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-xl">
          <Spinner size="lg" label="Loading dashboard…" />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-full text-red-600 text-sm">
          {error}
        </div>
      )}
      <div ref={mountRef} style={{ height, width: '100%' }} className="superset-embed" />
    </div>
  );
}
