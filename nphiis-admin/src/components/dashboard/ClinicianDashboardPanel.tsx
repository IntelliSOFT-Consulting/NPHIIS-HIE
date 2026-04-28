'use client';

import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  BeakerIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/lib/auth-context';
import { formatRole } from '@/lib/roles';

export default function ClinicianDashboardPanel() {
  const { user, roles, locationInfo, can } = useAuth();
  const router = useRouter();
  const primaryRole = user?.role || roles[0];

  const scope = [
    locationInfo?.facilityName,
    locationInfo?.wardName,
    locationInfo?.subCountyName,
    locationInfo?.countyName,
  ]
    .filter(Boolean)
    .join(' › ');

  const quickLinks: Array<{
    href: string;
    label: string;
    hint: string;
    icon: typeof BeakerIcon;
    visible: boolean;
  }> = [
    {
      href: '/locations',
      label: 'Locations',
      hint: 'Browse your facility and wards',
      icon: MapPinIcon,
      visible: true,
    },
    {
      href: '/lab',
      label: 'Lab',
      hint: 'Submit lab results',
      icon: BeakerIcon,
      visible: can('LAB_ACCESS'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="card-lg p-6 bg-nphi-gradient text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <h2 className="text-2xl font-semibold relative">
          Welcome{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p className="text-sm text-nphi-100 mt-1 relative">
          {primaryRole ? formatRole(primaryRole) : 'Practitioner'}
          {scope ? ` · ${scope}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickLinks
          .filter((l) => l.visible)
          .map((l) => {
            const Icon = l.icon;
            return (
              <button
                key={l.href}
                onClick={() => router.push(l.href)}
                className="card p-5 text-left hover:shadow-card-lg hover:border-nphi-200 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="h-11 w-11 rounded-2xl bg-nphi-gradient flex items-center justify-center text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRightIcon className="h-4 w-4 text-nphi-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="mt-4">
                  <div className="text-sm font-semibold text-nphi-900">{l.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{l.hint}</div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
