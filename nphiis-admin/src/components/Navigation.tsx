'use client';

import { 
  UsersIcon, 
  UserPlusIcon, 
  CogIcon,
  HomeIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface NavigationProps {
  activeTab: 'dashboard' | 'users' | 'settings';
  onTabChange: (tab: 'dashboard' | 'users' | 'settings') => void;
}

export default function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const navigation = [
    {
      name: 'Dashboard',
      tab: 'dashboard' as const,
      icon: ChartBarIcon,
      current: activeTab === 'dashboard',
    },
    {
      name: 'Users',
      tab: 'users' as const,
      icon: UsersIcon,
      current: activeTab === 'users',
    },
    {
      name: 'Settings',
      tab: 'settings' as const,
      icon: CogIcon,
      current: activeTab === 'settings',
    },
  ];

  return (
    <nav className="space-y-1">
      {navigation.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.name}
            onClick={() => onTabChange(item.tab)}
            className={`${
              item.current
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            } group flex items-center pl-2 py-2 text-sm font-medium border-l-4 transition duration-150 ease-in-out w-full text-left`}
          >
            <Icon
              className={`${
                item.current ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
              } mr-3 flex-shrink-0 h-5 w-5 transition duration-150 ease-in-out`}
              aria-hidden="true"
            />
            {item.name}
          </button>
        );
      })}
    </nav>
  );
}
