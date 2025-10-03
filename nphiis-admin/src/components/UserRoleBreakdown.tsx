'use client';

import { useEffect, useState } from 'react';
import { User, UserRole } from '@/types/user';
import { userApi, getAccessToken } from '@/lib/api';
import {
  UserGroupIcon,
  ShieldCheckIcon,
  ClipboardDocumentListIcon,
  BuildingOfficeIcon,
  UserIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

interface RoleStats {
  role: UserRole;
  count: number;
  percentage: number;
  color: string;
  icon: React.ComponentType<any>;
}

export default function UserRoleBreakdown() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleStats, setRoleStats] = useState<RoleStats[]>([]);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const accessToken = getAccessToken();
      if (!accessToken) {
        setError('No access token found. Please log in again.');
        return;
      }
      const userData = await userApi.getUsers(accessToken);
      setUsers(userData);
      calculateRoleStats(userData);
    } catch (err) {
      setError('Failed to load users data');
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateRoleStats = (userData: User[]) => {
    const totalUsers = userData.length;
    
    // Count users by role
    const roleCounts = userData.reduce((acc, user) => {
      const role = user.role || 'Unknown';
      acc[role as UserRole] = (acc[role as UserRole] || 0) + 1;
      return acc;
    }, {} as Record<UserRole, number>);

    // Define role colors and icons with fallback for dynamic roles
    const getRoleConfig = (role: string): { color: string; icon: React.ComponentType<any> } => {
      const defaultConfig: Record<string, { color: string; icon: React.ComponentType<any> }> = {
        'System Administrator': { color: 'bg-red-500', icon: ShieldCheckIcon },
        'Super User': { color: 'bg-purple-500', icon: UserGroupIcon },
        'County Disease Surveillance Officer': { color: 'bg-blue-500', icon: BuildingOfficeIcon },
        'Subcounty Disease Surveillance Officer': { color: 'bg-indigo-500', icon: BuildingOfficeIcon },
        'Facility Surveillance Focal Person': { color: 'bg-green-500', icon: ClipboardDocumentListIcon },
        'Supervisors': { color: 'bg-yellow-500', icon: UserGroupIcon },
        'Vaccinators': { color: 'bg-orange-500', icon: UserIcon },
        'NURSE': { color: 'bg-teal-500', icon: UserIcon },
        'Unknown': { color: 'bg-gray-500', icon: UserIcon },
        // Environment-based roles
        'ADMINISTRATOR': { color: 'bg-red-500', icon: ShieldCheckIcon },
        'SUPERUSER': { color: 'bg-purple-500', icon: UserGroupIcon },
        'COUNTY_DISEASE_SURVEILLANCE_OFFICER': { color: 'bg-blue-500', icon: BuildingOfficeIcon },
        'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER': { color: 'bg-indigo-500', icon: BuildingOfficeIcon },
        'FACILITY_SURVEILLANCE_FOCAL_PERSON': { color: 'bg-green-500', icon: ClipboardDocumentListIcon },
        'VACCINATOR': { color: 'bg-orange-500', icon: UserIcon },
      };
      
      return defaultConfig[role] || { color: 'bg-gray-500', icon: UserIcon };
    };

    // Create stats array
    const stats: RoleStats[] = Object.entries(roleCounts).map(([role, count]) => {
      const config = getRoleConfig(role);
      return {
        role: role as UserRole,
        count,
        percentage: totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0,
        color: config.color,
        icon: config.icon,
      };
    });

    // Sort by count (descending)
    stats.sort((a, b) => b.count - a.count);
    
    setRoleStats(stats);
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalUsers = users.length;
  const activeUsers = users.filter(user => user.enabled).length;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                  <dd className="text-lg font-medium text-gray-900">{totalUsers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UserIcon className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Users</dt>
                  <dd className="text-lg font-medium text-gray-900">{activeUsers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">User Roles</dt>
                  <dd className="text-lg font-medium text-gray-900">{roleStats.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Role Breakdown */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Users by Role</h3>
          <p className="text-sm text-gray-600 mt-1">
            Breakdown of users distributed across different roles
          </p>
        </div>
        
        <div className="p-6">
          {roleStats.length === 0 ? (
            <div className="text-center py-8">
              <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first user.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roleStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.role} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg ${stat.color}`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-gray-900">
                            {stat.role}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {stat.count} user{stat.count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-gray-900">
                          {stat.percentage}%
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${stat.color}`}
                          style={{ width: `${stat.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Role Distribution Chart */}
      {roleStats.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Role Distribution</h3>
            <p className="text-sm text-gray-600 mt-1">
              Visual representation of user role distribution
            </p>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              {roleStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.role} className="flex items-center">
                    <div className="flex items-center w-1/3">
                      <div className={`p-1.5 rounded ${stat.color} mr-3`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {stat.role}
                      </span>
                    </div>
                    <div className="flex-1 mx-4">
                      <div className="bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${stat.color}`}
                          style={{ width: `${stat.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-900 w-16 text-right">
                      {stat.count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
