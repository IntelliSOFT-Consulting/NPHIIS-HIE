'use client';

import { useState, useEffect } from 'react';
import { User } from '@/types/user';
import { userApi, getAccessToken } from '@/lib/api';
import { 
  MagnifyingGlassIcon, 
  EyeIcon, 
  PencilIcon, 
  TrashIcon,
  UserIcon,
  UserPlusIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  CalendarIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  IdentificationIcon,
  ShieldCheckIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import EditUserForm from './EditUserForm';
import PasswordResetModal from './PasswordResetModal';
// import Notification, { useNotification } from './Notification';

interface UserListProps {
  onCreateUser: () => void;
  refreshTrigger?: number;
}

export default function UserList({ onCreateUser, refreshTrigger }: UserListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // const { notifications, showSuccess, showError, removeNotification } = useNotification();

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadUsers();
    }
  }, [refreshTrigger]);

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
    } catch (err: any) {
      // Show API error message if available, otherwise show generic message
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load users. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    (user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    (user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    (user.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.role?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
  );

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setActionLoading(userId);
    try {
      await userApi.deleteUser(userId);
      setUsers(users.filter(user => user.id !== userId));
      alert('User deleted successfully');
    } catch (err) {
      alert('Failed to delete user');
      console.error('Error deleting user:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'disable' : 'enable';
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    setActionLoading(userId);
    try {
      const updatedUser = await userApi.toggleUserStatus(userId, !currentStatus);
      setUsers(users.map(user => user.id === userId ? updatedUser : user));
      alert(`User ${action}d successfully`);
    } catch (err) {
      alert(`Failed to ${action} user`);
      console.error(`Error ${action}ing user:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUserUpdated = () => {
    loadUsers();
  };

  const handlePasswordReset = () => {
    loadUsers();
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      'System Administrator': 'bg-red-100 text-red-800',
      'Super User': 'bg-purple-100 text-purple-800',
      'County Disease Surveillance Officer': 'bg-blue-100 text-blue-800',
      'Subcounty Disease Surveillance Officer': 'bg-indigo-100 text-indigo-800',
      'Facility Surveillance Focal Person': 'bg-green-100 text-green-800',
      'Supervisors': 'bg-yellow-100 text-yellow-800',
      'Vaccinators': 'bg-orange-100 text-orange-800',
      'NURSE': 'bg-teal-100 text-teal-800',
      'Unknown': 'bg-gray-100 text-gray-800',
      // Environment-based roles
      'ADMINISTRATOR': 'bg-red-100 text-red-800',
      'SUPERUSER': 'bg-purple-100 text-purple-800',
      'COUNTY_DISEASE_SURVEILLANCE_OFFICER': 'bg-blue-100 text-blue-800',
      'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER': 'bg-indigo-100 text-indigo-800',
      'FACILITY_SURVEILLANCE_FOCAL_PERSON': 'bg-green-100 text-green-800',
      'VACCINATOR': 'bg-orange-100 text-orange-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Users Management</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage system users and their roles
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Total: {users.length} users
            </div>
            <button
              onClick={onCreateUser}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
            >
              <UserPlusIcon className="h-4 w-4 mr-2" />
              Create User
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search users by name, email, ID number, or role..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading users</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : 'Get started by creating a new user.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600">
                              {(user.firstName?.charAt(0) || 'U')}{(user.lastName?.charAt(0) || '')}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.firstName || 'N/A'} {user.lastName || ''}
                          </div>
                          <div className="text-sm text-gray-500">
                            Username: {user.username.length > 10 ? `${user.username.substring(0, 10)}...` : user.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email || 'N/A'}</div>
                      <div className="text-sm text-gray-500">{user.phone || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role || 'Unknown')}`}>
                        {user.role || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.locationId || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                          title="View details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-indigo-600 hover:text-indigo-900 p-1 rounded hover:bg-indigo-50"
                          title="Edit user"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPasswordResetUser(user)}
                          className="text-yellow-600 hover:text-yellow-900 p-1 rounded hover:bg-yellow-50"
                          title="Reset password"
                        >
                          <KeyIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => user.id && handleToggleUserStatus(user.id, user.enabled ?? true)}
                          disabled={actionLoading === user.id}
                          className={`p-1 rounded ${
                            user.enabled 
                              ? 'text-orange-600 hover:text-orange-900 hover:bg-orange-50' 
                              : 'text-green-600 hover:text-green-900 hover:bg-green-50'
                          } ${actionLoading === user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={user.enabled ? 'Disable user' : 'Enable user'}
                        >
                          {user.enabled ? (
                            <XCircleIcon className="h-4 w-4" />
                          ) : (
                            <CheckCircleIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => user.id && handleDeleteUser(user.id)}
                          disabled={actionLoading === user.id}
                          className={`text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 ${
                            actionLoading === user.id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Delete user"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Enhanced User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-lg font-semibold text-blue-600">
                      {selectedUser.firstName.charAt(0)}{selectedUser.lastName.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {selectedUser.firstName} {selectedUser.lastName}
                    </h3>
                    <p className="text-sm text-gray-500">User ID: {selectedUser.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Status and Role Banner */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                      selectedUser.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedUser.enabled ? 'Active' : 'Inactive'}
                    </span>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getRoleBadgeColor(selectedUser.role)}`}>
                      {selectedUser.role}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedUser.createdTimestamp && (
                      <div className="flex items-center space-x-1">
                        <ClockIcon className="h-4 w-4" />
                        <span>Created {new Date(selectedUser.createdTimestamp).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <UserIcon className="h-5 w-5 mr-2 text-blue-600" />
                    Personal Information
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <IdentificationIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                        <p className="text-sm text-gray-900">{selectedUser.firstName} {selectedUser.lastName}</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <IdentificationIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <p className="text-sm text-gray-900 font-mono" title={selectedUser.username}>
                          {selectedUser.username.length > 10 ? `${selectedUser.username.substring(0, 10)}...` : selectedUser.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <EnvelopeIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email Address</label>
                        <p className="text-sm text-gray-900">{selectedUser.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <PhoneIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phone Number</label>
                        <p className="text-sm text-gray-900">{selectedUser.phone}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* System Information */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <ShieldCheckIcon className="h-5 w-5 mr-2 text-blue-600" />
                    System Information
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <ShieldCheckIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">User Role</label>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(selectedUser.role)}`}>
                          {selectedUser.role}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <MapPinIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Location ID</label>
                        <p className="text-sm text-gray-900 font-mono">{selectedUser.locationId}</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <CheckCircleIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Account Status</label>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          selectedUser.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {selectedUser.enabled ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <CalendarIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Created Date</label>
                        <p className="text-sm text-gray-900">
                          {selectedUser.createdTimestamp 
                            ? new Date(selectedUser.createdTimestamp).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Not available'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setEditingUser(selectedUser);
                    }}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <PencilIcon className="h-4 w-4 mr-2" />
                    Edit User
                  </button>
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setPasswordResetUser(selectedUser);
                    }}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <KeyIcon className="h-4 w-4 mr-2" />
                    Reset Password
                  </button>
                  <button
                    onClick={() => {
                      if (selectedUser.id) {
                        handleToggleUserStatus(selectedUser.id, selectedUser.enabled ?? true);
                        setSelectedUser(null);
                      }
                    }}
                    className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      actionLoading === selectedUser.id ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={actionLoading === selectedUser.id}
                  >
                    {selectedUser.enabled ? (
                      <XCircleIcon className="h-4 w-4 mr-2" />
                    ) : (
                      <CheckCircleIcon className="h-4 w-4 mr-2" />
                    )}
                    {selectedUser.enabled ? 'Disable User' : 'Enable User'}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition duration-150 ease-in-out"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserForm
          user={editingUser}
          onUserUpdated={handleUserUpdated}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Password Reset Modal */}
      {passwordResetUser && (
        <PasswordResetModal
          user={passwordResetUser}
          onPasswordReset={handlePasswordReset}
          onClose={() => setPasswordResetUser(null)}
        />
      )}
    </div>
  );
}
