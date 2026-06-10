'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  UsersIcon,
  ChartBarIcon,
  MapPinIcon,
  BeakerIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  name: string;
  href: string;
  icon: typeof UsersIcon;
  visible: boolean;
}

interface SettingsSubItem {
  name: string;
  href: string;
  icon: typeof ClipboardDocumentListIcon;
}

const SETTINGS_SUB_ITEMS: SettingsSubItem[] = [
  {
    name: 'Subscription logs',
    href: '/settings/subscription-logs',
    icon: ClipboardDocumentListIcon,
  },
  {
    name: 'EPID retry',
    href: '/settings/epid-retry',
    icon: ArrowPathIcon,
  },
  {
    name: 'Notification logs',
    href: '/settings/notification-logs',
    icon: BellAlertIcon,
  },
];

export default function Navigation() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const showSettings = can('SUBSCRIPTION_LOGS_VIEW');
  const settingsActive = pathname.startsWith('/settings');
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  useEffect(() => {
    if (settingsActive) {
      setSettingsOpen(true);
    }
  }, [settingsActive]);

  const navigation: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: ChartBarIcon, visible: true },
    { name: 'Users', href: '/users', icon: UsersIcon, visible: can('USERS_MANAGE') },
    { name: 'Locations', href: '/locations', icon: MapPinIcon, visible: true },
    { name: 'Lab', href: '/lab', icon: BeakerIcon, visible: can('LAB_ACCESS') },
  ];

  return (
    <nav className="space-y-1.5">
      {navigation
        .filter((item) => item.visible)
        .map((item) => {
          const Icon = item.icon;
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => router.push(item.href)}
              className={`group flex items-center w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                current
                  ? 'bg-nphi-gradient text-white shadow-sm'
                  : 'text-nphi-900/70 hover:bg-nphi-50 hover:text-nphi-800'
              }`}
            >
              <Icon
                className={`mr-3 h-5 w-5 flex-shrink-0 ${
                  current ? 'text-white' : 'text-nphi-700/70 group-hover:text-nphi-700'
                }`}
              />
              {item.name}
            </button>
          );
        })}

      {showSettings && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className={`group flex items-center w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              settingsActive
                ? 'bg-nphi-gradient text-white shadow-sm'
                : 'text-nphi-900/70 hover:bg-nphi-50 hover:text-nphi-800'
            }`}
          >
            <Cog6ToothIcon
              className={`mr-3 h-5 w-5 flex-shrink-0 ${
                settingsActive ? 'text-white' : 'text-nphi-700/70 group-hover:text-nphi-700'
              }`}
            />
            <span className="flex-1 text-left">Settings</span>
            <ChevronDownIcon
              className={`h-4 w-4 flex-shrink-0 transition-transform ${
                settingsOpen ? 'rotate-180' : ''
              } ${settingsActive ? 'text-white/90' : 'text-nphi-700/70'}`}
            />
          </button>

          {settingsOpen && (
            <div className="mt-1 ml-3 pl-3 border-l border-nphi-100 space-y-1">
              {SETTINGS_SUB_ITEMS.map((item) => {
                const Icon = item.icon;
                const current =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className={`group flex items-center w-full px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      current
                        ? 'bg-nphi-50 text-nphi-900 ring-1 ring-nphi-100'
                        : 'text-nphi-900/70 hover:bg-nphi-50 hover:text-nphi-800'
                    }`}
                  >
                    <Icon
                      className={`mr-2.5 h-4 w-4 flex-shrink-0 ${
                        current ? 'text-nphi-800' : 'text-nphi-700/70 group-hover:text-nphi-700'
                      }`}
                    />
                    {item.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
