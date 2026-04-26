'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  UsersIcon,
  ChartBarIcon,
  MapPinIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  name: string;
  href: string;
  icon: typeof UsersIcon;
  visible: boolean;
}

export default function Navigation() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';

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
    </nav>
  );
}
