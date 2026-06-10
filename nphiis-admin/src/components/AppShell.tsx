'use client';

import { useMemo, type ReactNode } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import Navigation from './Navigation';
import { useAuth } from '@/lib/auth-context';
import { formatRole } from '@/lib/roles';

export const PAGE_META: Record<
  string,
  { title: string; subtitle: string }
> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview of surveillance activity' },
  '/users': { title: 'Users', subtitle: 'Manage practitioners and roles' },
  '/locations': {
    title: 'Locations',
    subtitle: 'Counties, sub-counties, wards, facilities',
  },
  '/lab': { title: 'Lab', subtitle: 'Submit results and manage bulk uploads' },
  '/settings': { title: 'Settings', subtitle: 'System configuration' },
  '/settings/subscription-logs': {
    title: 'Subscription logs',
    subtitle: 'FHIR subscription webhook audit trail (EPID, AFP follow-up, backfill)',
  },
  '/settings/epid-retry': {
    title: 'EPID retry',
    subtitle: 'Manually retry EPID assignment for encounters missing an official identifier',
  },
  '/settings/notification-logs': {
    title: 'Notification logs',
    subtitle: 'AFP follow-up and case submission notification records',
  },
  '/subscription-logs': {
    title: 'Subscription logs',
    subtitle: 'FHIR subscription webhook audit trail (EPID, AFP follow-up, backfill)',
  },
};

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, roles, locationInfo, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '/dashboard';

  const meta = PAGE_META[pathname] ?? PAGE_META['/dashboard'];

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName =
    user?.firstName || user?.name?.split(' ')[0] || user?.username || 'there';

  // Prefer the canonical role from /provider/me over JWT realm roles so users
  // see their assigned NPHIIS role, not Keycloak plumbing like
  // "default-roles-master".
  const primaryRole = user?.role || roles[0];
  const roleLabel = primaryRole ? formatRole(primaryRole) : null;
  const scopeLabel =
    locationInfo?.facilityName ??
    locationInfo?.wardName ??
    locationInfo?.subCountyName ??
    locationInfo?.countyName ??
    null;

  const handleLogout = () => {
    signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-surface flex">
      <aside className="hidden md:flex md:flex-col w-64 max-h-[calc(100vh-2rem)] bg-white border-r border-nphi-100/60 m-4 rounded-3xl shadow-card">
        <div className="px-5 pt-5 pb-4 border-b border-nphi-100/60">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl overflow-hidden bg-white ring-1 ring-nphi-100">
              <Image src="/nphi.png" alt="NPHI" fill className="object-contain p-1" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-nphi-900 truncate">NPHIIS</div>
              <div className="text-[11px] text-gray-500 truncate">Admin Portal</div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-3 py-5 overflow-y-auto">
          <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Main
          </div>
          <Navigation />
        </div>

        <div className="p-4 border-t border-nphi-100/60">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-nphi-gradient flex items-center justify-center text-white text-sm font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-nphi-900 truncate">
                {user?.name || displayName}
              </div>
              <div className="text-[11px] text-gray-500 truncate">
                {roleLabel || user?.email || ''}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="px-6 pt-5 pb-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-gray-500">
              {greeting},{' '}
              <span className="font-medium text-nphi-800">{displayName}</span>
              {scopeLabel ? ` · ${scopeLabel}` : ''}
            </div>
            <h1 className="text-2xl font-semibold text-nphi-900 mt-1 leading-tight">
              {meta.title}
            </h1>
            <p className="text-sm text-gray-500">{meta.subtitle}</p>
          </div>

        </header>

        <main className="flex-1 px-6 pb-8">{children}</main>
      </div>
    </div>
  );
}
