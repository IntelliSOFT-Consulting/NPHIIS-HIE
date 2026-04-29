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

  useEffect(() => {
    if (!mountRef.current || !accessToken || !supersetUrl) return;

    // Capture once for the cleanup closure so we don't read a stale ref.
    const node = mountRef.current;
    setLoading(true);
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
      mountPoint: node,
      fetchGuestToken,
      dashboardUiConfig: {
        // Page already has its own heading; hide the in-iframe title.
        hideTitle: true,
        // Show the dashboard's internal tab strip (503 / 502 forms).
        hideTab: false,
        // Don't expose chart-export / drilldown menus to embedded viewers.
        hideChartControls: true,
        // Collapsed by default — the open filter sidebar squeezed all the
        // chart real-estate when first loaded. Users can expand it manually.
        filters: { expanded: false },
      },
    })
      .then(() => {
        if (!cancelled) {
          setLoading(false);
          // The Superset SDK injects an <iframe> as the only child of the
          // mount node. Make it fill the container so the dashboard isn't
          // pinned to ~300×200 by default styles.
          const iframe = node.querySelector('iframe');
          if (iframe) {
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = '0';
            iframe.style.display = 'block';
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Superset embed failed:', err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      node.innerHTML = '';
    };
  }, [dashboardId, supersetUrl, accessToken]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-white"
      style={{ height }}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
          <Spinner size="lg" label="Loading dashboard…" />
        </div>
      )}
      <div ref={mountRef} className="superset-embed h-full w-full" />
    </div>
  );
}
