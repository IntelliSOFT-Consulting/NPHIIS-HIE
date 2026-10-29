'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User } from '@/types/user';
import { userApi, rolesApi, getAccessToken, fhirApi, FhirCounty, FhirSubCounty, FhirWard, FhirFacility, isUnauthorizedError, handleUnauthorized } from '@/lib/api';
import { LOCATION_FREE_ROLES } from '@/lib/roles';
import RolePicker from './RolePicker';
import { XMarkIcon } from '@heroicons/react/24/outline';
// import { useNotification } from './Notification';

type FormData = {
  idNumber: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  locationId?: string;
  subCountyId?: string;
  wardId?: string;
  facilityId?: string;
  role: string;
  enabled: boolean;
};

interface EditUserFormProps {
  user: User;
  onUserUpdated: () => void;
  onClose: () => void;
}

export default function EditUserForm({ user, onUserUpdated, onClose }: EditUserFormProps) {
  const [applicationRoles, setApplicationRoles] = useState<string[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [rolesError, setRolesError] = useState('');
  const [profileSlug, setProfileSlug] = useState<string>(
    ((user as unknown as { attributes?: { nphiis_profile?: string[] } }).attributes?.nphiis_profile?.[0]) ?? '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [counties, setCounties] = useState<FhirCounty[]>([]);
  const [isLoadingCounties, setIsLoadingCounties] = useState(false);
  const [countiesError, setCountiesError] = useState('');
  const [subCounties, setSubCounties] = useState<FhirSubCounty[]>([]);
  const [isLoadingSubCounties, setIsLoadingSubCounties] = useState(false);
  const [subCountiesError, setSubCountiesError] = useState('');
  const [wards, setWards] = useState<FhirWard[]>([]);
  const [isLoadingWards, setIsLoadingWards] = useState(false);
  const [wardsError, setWardsError] = useState('');
  const [facilities, setFacilities] = useState<FhirFacility[]>([]);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false);
  const [facilitiesError, setFacilitiesError] = useState('');
  // const { showSuccess, showError } = useNotification();

  const editUserSchema = useMemo(
    () =>
      z.object({
        idNumber: z.string().min(1, 'ID Number is required'),
        email: z.string().email('Invalid email address'),
        firstName: z.string().min(1, 'First name is required'),
        lastName: z.string().min(1, 'Last name is required'),
        phone: z.string().min(1, 'Phone number is required'),
        locationId: z.string().optional(),
        subCountyId: z.string().optional(),
        wardId: z.string().optional(),
        facilityId: z.string().optional(),
        role: z
          .string()
          .min(1, 'Role is required')
          .refine((val) => applicationRoles.length === 0 || applicationRoles.includes(val), {
            message: 'Select a valid role',
          }),
        enabled: z.boolean(),
      }),
    [applicationRoles],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
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
      locationId: user.locationInfo?.county || user.locationId || '',
      subCountyId: user.locationInfo?.subCounty || '',
      wardId: user.locationInfo?.ward || '',
      facilityId: user.locationInfo?.facility || '',
      role: user.role as FormData['role'],
      enabled: user.enabled ?? true,
    },
  });

  // Watch the role, county, sub-county, and ward fields to determine visibility
  const selectedRole = watch('role');
  const selectedCountyId = watch('locationId');
  const selectedSubCountyId = watch('subCountyId');
  const selectedWardId = watch('wardId');
  
  // Determine visibility based on role
  // National roles with no location of their own (administrators, call-centre agents).
  const isLocationDisabled = LOCATION_FREE_ROLES.includes(selectedRole);
  const showCountyOnly = selectedRole === 'COUNTY_DISEASE_SURVEILLANCE_OFFICER';
  const showSubCountyOnly = selectedRole === 'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER';
  const showSubCounty = !isLocationDisabled && !showCountyOnly;
  const showWard = !isLocationDisabled && !showCountyOnly && !showSubCountyOnly;
  const showFacility = showWard; // Facility is shown for the same roles as ward

  useEffect(() => {
    const fetchRoles = async () => {
      setIsLoadingRoles(true);
      setRolesError('');
      try {
        const roles = await rolesApi.getRoles();
        setApplicationRoles(roles);
      } catch (error) {
        console.error('Failed to fetch roles:', error);
        setRolesError('Failed to load roles from auth service. Please refresh the page.');
      } finally {
        setIsLoadingRoles(false);
      }
    };

    fetchRoles();
  }, []);

  // The dropdowns fill in one after another, and a select drops a value whose option has not
  // loaded yet. Re-apply the saved location as each list arrives, but only while the choice
  // above it is still the saved one, so a changed county never keeps an old sub-county.
  const saved = user.locationInfo;
  useEffect(() => {
    if (counties.length && saved?.county) setValue('locationId', saved.county);
  }, [counties, saved?.county, setValue]);
  useEffect(() => {
    if (subCounties.length && saved?.subCounty && selectedCountyId === saved.county) setValue('subCountyId', saved.subCounty);
  }, [subCounties, saved?.subCounty, saved?.county, selectedCountyId, setValue]);
  useEffect(() => {
    if (wards.length && saved?.ward && selectedSubCountyId === saved.subCounty) setValue('wardId', saved.ward);
  }, [wards, saved?.ward, saved?.subCounty, selectedSubCountyId, setValue]);
  useEffect(() => {
    if (facilities.length && saved?.facility && selectedWardId === saved.ward) setValue('facilityId', saved.facility);
  }, [facilities, saved?.facility, saved?.ward, selectedWardId, setValue]);

  // Fetch counties from FHIR server on component mount
  useEffect(() => {
    const fetchCounties = async () => {
      setIsLoadingCounties(true);
      setCountiesError('');
      try {
        const fetchedCounties = await fhirApi.getCounties();
        setCounties(fetchedCounties);
      } catch (error: any) {
        console.error('Failed to fetch counties:', error);
        if (isUnauthorizedError(error)) {
          handleUnauthorized();
          return;
        }
        setCountiesError('Failed to load counties. Please refresh the page.');
      } finally {
        setIsLoadingCounties(false);
      }
    };

    fetchCounties();
  }, []);

  // Pre-populate location data from user.locationInfo
  useEffect(() => {
    if (user.locationInfo) {
      const { county, subCounty, ward, facility } = user.locationInfo;
      
      if (county) {
        setValue('locationId', county);
      }
      if (subCounty) {
        setValue('subCountyId', subCounty);
      }
      if (ward) {
        setValue('wardId', ward);
      }
      if (facility) {
        setValue('facilityId', facility);
      }
    }
  }, [user.locationInfo, setValue]);

  // Fetch sub-counties when county is selected
  useEffect(() => {
    const fetchSubCounties = async () => {
      if (!selectedCountyId || !showSubCounty) {
        setSubCounties([]);
        if (!selectedCountyId) {
          setValue('subCountyId', '');
        }
        return;
      }

      setIsLoadingSubCounties(true);
      setSubCountiesError('');
      try {
        const fetchedSubCounties = await fhirApi.getSubCounties(selectedCountyId);
        setSubCounties(fetchedSubCounties);
        // Only clear sub-county selection if county changed (not on initial load)
        if (!user.locationInfo?.subCounty) {
          setValue('subCountyId', '');
        }
      } catch (error: any) {
        console.error('Failed to fetch sub-counties:', error);
        if (isUnauthorizedError(error)) {
          handleUnauthorized();
          return;
        }
        setSubCountiesError('Failed to load sub-counties. Please try again.');
        setSubCounties([]);
      } finally {
        setIsLoadingSubCounties(false);
      }
    };

    fetchSubCounties();
  }, [selectedCountyId, showSubCounty, setValue, user.locationInfo?.subCounty]);

  // Fetch wards when sub-county is selected
  useEffect(() => {
    const fetchWards = async () => {
      if (!selectedSubCountyId || !showWard) {
        setWards([]);
        if (!selectedSubCountyId) {
          setValue('wardId', '');
        }
        return;
      }

      setIsLoadingWards(true);
      setWardsError('');
      try {
        const fetchedWards = await fhirApi.getWards(selectedSubCountyId);
        setWards(fetchedWards);
        // Only clear ward selection if sub-county changed (not on initial load)
        if (!user.locationInfo?.ward) {
          setValue('wardId', '');
        }
      } catch (error: any) {
        console.error('Failed to fetch wards:', error);
        if (isUnauthorizedError(error)) {
          handleUnauthorized();
          return;
        }
        setWardsError('Failed to load wards. Please try again.');
        setWards([]);
      } finally {
        setIsLoadingWards(false);
      }
    };

    fetchWards();
  }, [selectedSubCountyId, showWard, setValue, user.locationInfo?.ward]);

  // Fetch facilities when ward is selected
  useEffect(() => {
    const fetchFacilities = async () => {
      if (!selectedWardId || !showFacility) {
        setFacilities([]);
        if (!selectedWardId) {
          setValue('facilityId', '');
        }
        return;
      }

      setIsLoadingFacilities(true);
      setFacilitiesError('');
      try {
        const fetchedFacilities = await fhirApi.getFacilities(selectedWardId);
        setFacilities(fetchedFacilities);
        // Only clear facility selection if ward changed (not on initial load)
        if (!user.locationInfo?.facility) {
          setValue('facilityId', '');
        }
      } catch (error: any) {
        console.error('Failed to fetch facilities:', error);
        if (isUnauthorizedError(error)) {
          handleUnauthorized();
          return;
        }
        setFacilitiesError('Failed to load facilities. Please try again.');
        setFacilities([]);
      } finally {
        setIsLoadingFacilities(false);
      }
    };

    fetchFacilities();
  }, [selectedWardId, showFacility, setValue, user.locationInfo?.facility]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        setErrorMessage('No access token found. Please log in again.');
        setSubmitStatus('error');
        handleUnauthorized();
        return;
      }

      // Determine the correct locationId based on role
      // Use the lowest level location appropriate for the user's role
      let locationId = '';
      
      if (LOCATION_FREE_ROLES.includes(selectedRole)) {
        // No location for national roles
        locationId = '';
      } else if (selectedRole === 'COUNTY_DISEASE_SURVEILLANCE_OFFICER') {
        // County level - use county ID
        locationId = data.locationId || '';
      } else if (selectedRole === 'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER') {
        // Sub-county level - use sub-county ID
        locationId = data.subCountyId || '';
      } else {
        // Facility level roles (FACILITY_SURVEILLANCE_FOCAL_PERSON, SUPERVISORS, VACCINATOR)
        // Use facility ID if provided, otherwise ward ID
        locationId = data.facilityId || data.wardId || '';
      }
      
      const userDataToSubmit = {
        ...data,
        profile: profileSlug || undefined,
        locationId: locationId
      };

      // Use username (idNumber) instead of id for the update
      await userApi.updateUser(user.username, userDataToSubmit, accessToken);
      setSubmitStatus('success');
      setTimeout(() => {
        onUserUpdated();
        onClose();
      }, 1500);
    } catch (error: any) {
      // Check for unauthorized errors first
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
        return;
      }
      
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <h3 className="md:col-span-2 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-1">
                Personal details
              </h3>
              {/* First Name */}
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name *
                </label>
                <input
                  {...register('firstName')}
                  type="text"
                  id="firstName"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 text-gray-900"
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
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 text-gray-900"
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
                  readOnly
                  aria-readonly="true"
                  className="mt-1 block w-full border border-gray-200 rounded-md px-3 py-2 bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">The ID number is the login and cannot be changed.</p>
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
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 text-gray-900"
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
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 text-gray-900"
                />
                {errors.phone && (
                  <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                )}
              </div>

              <h3 className="md:col-span-2 mt-2 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-1">
                Access
              </h3>
              {/* Role */}
              <div className="md:col-span-2">
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role *
                </label>
                <RolePicker
                  roles={applicationRoles}
                  role={selectedRole}
                  profileSlug={profileSlug}
                  disabled={isLoadingRoles || applicationRoles.length === 0}
                  loadingLabel={isLoadingRoles ? user.role : undefined}
                  onChange={(role, slug) => {
                    setValue('role', role, { shouldValidate: true });
                    setProfileSlug(slug);
                  }}
                />
                {rolesError && (
                  <p className="mt-1 text-sm text-red-600">{rolesError}</p>
                )}
                {errors.role && (
                  <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
                )}
              </div>

            </div>

            {/* Location Information */}
            {!isLocationDisabled && (
              <div>
                <h3 className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-1 mb-2">Location</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Select the user&apos;s location. {showWard && 'Select options in order from county to facility.'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isLocationDisabled && (
                    <div>
                      <label htmlFor="locationId" className="block text-sm font-medium text-gray-700">
                        County {isLoadingCounties && <span className="text-gray-500 text-xs">(Loading...)</span>}
                      </label>
                      {countiesError ? (
                        <div className="mt-1">
                          <p className="text-sm text-red-600">{countiesError}</p>
                          <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-1 text-sm text-blue-600 hover:text-blue-800"
                          >
                            Refresh Page
                          </button>
                        </div>
                      ) : (
                        <select
                          {...register('locationId')}
                          id="locationId"
                          disabled={isLoadingCounties}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">Select a county</option>
                          {counties.map((county) => (
                            <option key={county.id} value={county.id}>
                              {county.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.locationId && (
                        <p className="mt-1 text-sm text-red-600">{errors.locationId.message}</p>
                      )}
                    </div>
                  )}

                  {showSubCounty && (
                    <div>
                      <label htmlFor="subCountyId" className="block text-sm font-medium text-gray-700">
                        Sub-County {isLoadingSubCounties && <span className="text-gray-500 text-xs">(Loading...)</span>}
                      </label>
                      {!selectedCountyId ? (
                        <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md">
                          <p className="text-sm text-gray-600">⬆️ Please select a county first</p>
                        </div>
                      ) : subCountiesError ? (
                        <div className="mt-1">
                          <p className="text-sm text-red-600">{subCountiesError}</p>
                        </div>
                      ) : (
                        <select
                          {...register('subCountyId')}
                          id="subCountyId"
                          disabled={isLoadingSubCounties || !selectedCountyId}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">Select a sub-county</option>
                          {subCounties.map((subCounty) => (
                            <option key={subCounty.id} value={subCounty.id}>
                              {subCounty.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.subCountyId && (
                        <p className="mt-1 text-sm text-red-600">{errors.subCountyId.message}</p>
                      )}
                    </div>
                  )}

                  {showWard && (
                    <div>
                      <label htmlFor="wardId" className="block text-sm font-medium text-gray-700">
                        Ward {isLoadingWards && <span className="text-gray-500 text-xs">(Loading...)</span>}
                      </label>
                      {!selectedSubCountyId ? (
                        <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md">
                          <p className="text-sm text-gray-600">⬆️ Please select a sub-county first</p>
                        </div>
                      ) : wardsError ? (
                        <div className="mt-1">
                          <p className="text-sm text-red-600">{wardsError}</p>
                        </div>
                      ) : (
                        <>
                          <select
                            {...register('wardId')}
                            id="wardId"
                            disabled={isLoadingWards || !selectedSubCountyId}
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          >
                            <option value="">Select a ward</option>
                            {wards.map((ward) => (
                              <option key={ward.id} value={ward.id}>
                                {ward.name}
                              </option>
                            ))}
                          </select>
                          {!isLoadingWards && wards.length === 0 && selectedSubCountyId && (
                            <p className="mt-1 text-sm text-yellow-600">No wards found for this sub-county</p>
                          )}
                        </>
                      )}
                      {errors.wardId && (
                        <p className="mt-1 text-sm text-red-600">{errors.wardId.message}</p>
                      )}
                    </div>
                  )}

                  {showFacility && (
                    <div>
                      <label htmlFor="facilityId" className="block text-sm font-medium text-gray-700">
                        Facility {isLoadingFacilities && <span className="text-gray-500 text-xs">(Loading...)</span>}
                      </label>
                      {!selectedWardId ? (
                        <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md">
                          <p className="text-sm text-gray-600">⬆️ Please select a ward first</p>
                        </div>
                      ) : facilitiesError ? (
                        <div className="mt-1">
                          <p className="text-sm text-red-600">{facilitiesError}</p>
                        </div>
                      ) : (
                        <>
                          <select
                            {...register('facilityId')}
                            id="facilityId"
                            disabled={isLoadingFacilities || !selectedWardId}
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          >
                            <option value="">Select a facility</option>
                            {facilities.map((facility) => (
                              <option key={facility.id} value={facility.id}>
                                {facility.name}
                              </option>
                            ))}
                          </select>
                          {!isLoadingFacilities && facilities.length === 0 && selectedWardId && (
                            <p className="mt-1 text-sm text-yellow-600">No facilities found for this ward</p>
                          )}
                        </>
                      )}
                      {errors.facilityId && (
                        <p className="mt-1 text-sm text-red-600">{errors.facilityId.message}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="md:max-w-xs">
              <label htmlFor="enabled" className="block text-sm font-medium text-gray-700">
                Account status
              </label>
              <select
                {...register('enabled', { 
                  setValueAs: (v) => v === 'true'
                })}
                id="enabled"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-nphi-500 focus:border-nphi-500 text-gray-900"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
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
            <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white/95 backdrop-blur flex justify-end space-x-3 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nphi-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-nphi-gradient hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nphi-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
