'use client';

import { useEffect, useState, useCallback } from 'react';
import { User, UserRole } from '@/types/user';
import { userApi, getAccessToken } from '@/lib/api';
import { UsersPlus } from '@untitled-ui/icons-react';
import { formatRole } from '@/lib/roles';

interface RoleStat {
  role: UserRole;
  count: number;
  dot: string;
}

// Compact "Users by Role" summary that sits above the embedded reports.
// Shows total / active counts inline and a horizontally-scrollable strip of
// role chips with counts. No big charts, no separate "role distribution"
// block — that was crowding the page and hiding the dashboard below.
export default function UserRoleBreakdown() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleStats, setRoleStats] = useState<RoleStat[]>([]);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const accessToken = getAccessToken();
      if (!accessToken) {
        setError('No access token found. Please log in again.');
        return;
      }
      const response = await userApi.getUsers(accessToken, 1, 10000);
      setUsers(response.users);
      calculateRoleStats(response.users);
    } catch (err) {
      setError('Failed to load users data');
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const calculateRoleStats = (userData: User[]) => {
    const counts = userData.reduce<Record<string, number>>((acc, u) => {
      const role = (u.role as string) || 'Unknown';
      acc[role] = (acc[role] ?? 0) + 1;
      return acc;
    }, {});

    const dot = (role: string): string => {
      const map: Record<string, string> = {
        ADMINISTRATOR: 'bg-rose-500',
        SUPERUSER: 'bg-purple-500',
        NATIONAL_FOCAL_PERSON: 'bg-blue-600',
        NATIONAL_VIEWER: 'bg-blue-400',
        COUNTY_DISEASE_SURVEILLANCE_OFFICER: 'bg-indigo-500',
        SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER: 'bg-indigo-400',
        FACILITY_SURVEILLANCE_FOCAL_PERSON: 'bg-emerald-500',
        LAB_TECHNICIAN: 'bg-amber-500',
        NATIONAL_LAB: 'bg-amber-600',
        VACCINATOR: 'bg-orange-500',
        NURSE: 'bg-teal-500',
        SUPERVISORS: 'bg-yellow-500',
      };
      if (role.includes('HEALTH_RECORDS_INFORMATION_OFFICER')) return 'bg-cyan-500';
      if (role.includes('HEALTH_PROMOTION_OFFICER')) return 'bg-lime-500';
      return map[role] ?? 'bg-gray-400';
    };

    const stats = Object.entries(counts)
      .map(([role, count]) => ({
        role: role as UserRole,
        count,
        dot: dot(role),
      }))
      .sort((a, b) => b.count - a.count);

    setRoleStats(stats);
  };

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.active === true).length;

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 w-40 bg-gray-200 rounded mb-3" />
        <div className="flex gap-2 flex-wrap">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6 w-32 bg-gray-200 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4 text-sm text-accent-700 bg-accent-50 border-accent-200">
        {error}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-nphi-50 text-nphi-700 flex items-center justify-center">
            <UsersPlus className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-gray-900">
              Users by Role
            </div>
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{totalUsers}</span>{' '}
              total ·{' '}
              <span className="font-medium text-emerald-700">{activeUsers}</span>{' '}
              active ·{' '}
              <span className="font-medium text-gray-700">
                {roleStats.length}
              </span>{' '}
              role{roleStats.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>

      {roleStats.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {roleStats.map((s) => (
            <span
              key={s.role}
              title={`${s.role}: ${s.count}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-700"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              <span className="font-medium">{formatRole(String(s.role))}</span>
              <span className="text-gray-500">·</span>
              <span className="font-semibold text-gray-900">{s.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
