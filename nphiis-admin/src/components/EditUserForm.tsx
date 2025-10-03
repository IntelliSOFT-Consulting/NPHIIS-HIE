'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, UserRole } from '@/types/user';
import { userApi, getAccessToken } from '@/lib/api';
import { XMarkIcon } from '@heroicons/react/24/outline';
// import { useNotification } from './Notification';

const editUserSchema = z.object({
  idNumber: z.string().min(1, 'ID Number is required'),
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(1, 'Phone number is required'),
  locationId: z.string().optional(),
  role: z.enum([
    'ADMINISTRATOR',
    'SUPERUSER',
    'COUNTY_DISEASE_SURVEILLANCE_OFFICER',
    'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER',
    'FACILITY_SURVEILLANCE_FOCAL_PERSON',
    'SUPERVISORS',
    'VACCINATOR'
  ] as const),
  enabled: z.boolean(),
});

type FormData = z.infer<typeof editUserSchema>;

// Load roles from environment variable
const getRolesFromEnv = (): UserRole[] => {
  const envRoles = process.env.NEXT_PUBLIC_USER_ROLES || process.env.USER_ROLES;
  if (!envRoles) {
    // Fallback to default roles if env var is not set
    return [
      'ADMINISTRATOR',
      'SUPERUSER',
      'COUNTY_DISEASE_SURVEILLANCE_OFFICER',
      'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER',
      'FACILITY_SURVEILLANCE_FOCAL_PERSON',
      'SUPERVISORS',
      'VACCINATOR'
    ];
  }
  
  return envRoles.split(',').map(role => role.trim()) as UserRole[];
};

const ROLES: UserRole[] = getRolesFromEnv();

interface EditUserFormProps {
  user: User;
  onUserUpdated: () => void;
  onClose: () => void;
}

export default function EditUserForm({ user, onUserUpdated, onClose }: EditUserFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // const { showSuccess, showError } = useNotification();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(editUserSchema),
    mode: 'onChange',
    defaultValues: {
      idNumber: user.username, // Map username back to idNumber for editing
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      locationId: user.locationId || '',
      role: user.role,
      enabled: user.enabled ?? true,
    },
  });

  // Watch the role field to determine if location should be disabled
  const selectedRole = watch('role');
  const isLocationDisabled = selectedRole === 'ADMINISTRATOR' || selectedRole === 'SUPERUSER';

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        setErrorMessage('No access token found. Please log in again.');
        setSubmitStatus('error');
        return;
      }

      await userApi.updateUser(user.id!, data, accessToken);
      setSubmitStatus('success');
      setTimeout(() => {
        onUserUpdated();
        onClose();
      }, 1500);
    } catch (error: any) {
      setSubmitStatus('error');
      // Prioritize API error message, then generic error message, then fallback
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update user. Please try again.';
      setErrorMessage(errorMessage);
      console.error('Error updating user:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">Edit User</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* First Name */}
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name *
                </label>
                <input
                  {...register('firstName')}
                  type="text"
                  id="firstName"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>

              {/* Last Name */}
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last Name *
                </label>
                <input
                  {...register('lastName')}
                  type="text"
                  id="lastName"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>

              {/* ID Number */}
              <div>
                <label htmlFor="idNumber" className="block text-sm font-medium text-gray-700">
                  ID Number *
                </label>
                <input
                  {...register('idNumber')}
                  type="text"
                  id="idNumber"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                {errors.idNumber && (
                  <p className="mt-1 text-sm text-red-600">{errors.idNumber.message}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email *
                </label>
                <input
                  {...register('email')}
                  type="email"
                  id="email"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Phone Number *
                </label>
                <input
                  {...register('phone')}
                  type="tel"
                  id="phone"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                {errors.phone && (
                  <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                )}
              </div>

              {/* Role */}
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role *
                </label>
                <select
                  {...register('role')}
                  id="role"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {errors.role && (
                  <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
                )}
              </div>

              {/* Location ID */}
              {!isLocationDisabled && (
                <div>
                  <label htmlFor="locationId" className="block text-sm font-medium text-gray-700">
                    Location ID
                  </label>
                  <input
                    {...register('locationId')}
                    type="text"
                    id="locationId"
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    placeholder="Enter location ID"
                  />
                  {errors.locationId && (
                    <p className="mt-1 text-sm text-red-600">{errors.locationId.message}</p>
                  )}
                </div>
              )}

              {/* Status */}
              <div>
                <label htmlFor="enabled" className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  {...register('enabled', { valueAsBoolean: true })}
                  id="enabled"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>

            {/* Error Message */}
            {submitStatus === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error updating user</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{errorMessage}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {submitStatus === 'success' && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">User updated successfully</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>The user has been updated successfully.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Updating...' : 'Update User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
