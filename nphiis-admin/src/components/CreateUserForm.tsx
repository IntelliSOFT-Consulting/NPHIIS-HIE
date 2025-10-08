'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreateUserRequest, UserRole } from '@/types/user';
import { userApi, getAccessToken, fhirApi, FhirCounty, FhirSubCounty, FhirWard, FhirFacility, isUnauthorizedError, handleUnauthorized } from '@/lib/api';
import { 
  UserIcon, 
  EyeIcon, 
  EyeSlashIcon,
  CheckCircleIcon,
  XCircleIcon 
} from '@heroicons/react/24/outline';

interface CreateUserFormProps {
  onUserCreated: () => void;
}

// Validation schema
const createUserSchema = z.object({
  idNumber: z.string().min(1, 'ID Number is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  locationId: z.string().optional(),
  subCountyId: z.string().optional(),
  wardId: z.string().optional(),
  facilityId: z.string().optional(),
  role: z.enum([
    'ADMINISTRATOR',
    'SUPERUSER',
    'COUNTY_DISEASE_SURVEILLANCE_OFFICER',
    'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER',
    'FACILITY_SURVEILLANCE_FOCAL_PERSON',
    'SUPERVISORS',
    'VACCINATOR'
  ] as const),
});

type FormData = z.infer<typeof createUserSchema>;

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

export default function CreateUserForm({ onUserCreated }: CreateUserFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(createUserSchema),
    mode: 'onChange',
    defaultValues: {
      idNumber: '',
      password: '',
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      locationId: '',
      subCountyId: '',
      wardId: '',
      facilityId: '',
      role: 'ADMINISTRATOR',
    },
  });

  // Watch the role, county, sub-county, and ward fields to determine visibility
  const selectedRole = watch('role');
  const selectedCountyId = watch('locationId');
  const selectedSubCountyId = watch('subCountyId');
  const selectedWardId = watch('wardId');
  
  // Determine visibility based on role
  const isLocationDisabled = selectedRole === 'ADMINISTRATOR' || selectedRole === 'SUPERUSER';
  const showCountyOnly = selectedRole === 'COUNTY_DISEASE_SURVEILLANCE_OFFICER';
  const showSubCountyOnly = selectedRole === 'SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER';
  const showSubCounty = !isLocationDisabled && !showCountyOnly;
  const showWard = !isLocationDisabled && !showCountyOnly && !showSubCountyOnly;
  const showFacility = showWard; // Facility is shown for the same roles as ward

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

  // Fetch sub-counties when county is selected
  useEffect(() => {
    const fetchSubCounties = async () => {
      if (!selectedCountyId || !showSubCounty) {
        setSubCounties([]);
        setValue('subCountyId', '');
        return;
      }

      setIsLoadingSubCounties(true);
      setSubCountiesError('');
      try {
        const fetchedSubCounties = await fhirApi.getSubCounties(selectedCountyId);
        setSubCounties(fetchedSubCounties);
        // Clear the sub-county selection when county changes
        setValue('subCountyId', '');
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
  }, [selectedCountyId, showSubCounty, setValue]);

  // Fetch wards when sub-county is selected
  useEffect(() => {
    const fetchWards = async () => {
      if (!selectedSubCountyId || !showWard) {
        setWards([]);
        setValue('wardId', '');
        return;
      }

      setIsLoadingWards(true);
      setWardsError('');
      try {
        const fetchedWards = await fhirApi.getWards(selectedSubCountyId);
        setWards(fetchedWards);
        // Clear the ward selection when sub-county changes
        setValue('wardId', '');
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
  }, [selectedSubCountyId, showWard, setValue]);

  // Fetch facilities when ward is selected
  useEffect(() => {
    const fetchFacilities = async () => {
      if (!selectedWardId || !showFacility) {
        setFacilities([]);
        setValue('facilityId', '');
        return;
      }

      setIsLoadingFacilities(true);
      setFacilitiesError('');
      try {
        const fetchedFacilities = await fhirApi.getFacilities(selectedWardId);
        setFacilities(fetchedFacilities);
        // Clear the facility selection when ward changes
        setValue('facilityId', '');
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
  }, [selectedWardId, showFacility, setValue]);


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
      
      if (selectedRole === 'ADMINISTRATOR' || selectedRole === 'SUPERUSER') {
        // No location for admin roles
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
        locationId: locationId
      };
      
      await userApi.createUser(userDataToSubmit as CreateUserRequest, accessToken);
      setSubmitStatus('success');
      reset();
      setTimeout(() => {
        onUserCreated();
      }, 2000);
    } catch (error: any) {
      // Check for unauthorized errors first
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
        return;
      }
      
      setSubmitStatus('error');
      // Prioritize API error message, then generic error message, then fallback
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create user. Please check your Keycloak configuration.';
      setErrorMessage(errorMessage);
      console.error('Error creating user:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          Add a new user to the NPHIIS system
        </p>
      </div>

      {/* Status Messages */}
      {submitStatus === 'success' && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-3">
          <div className="flex">
            <CheckCircleIcon className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">User created successfully!</h3>
              <p className="mt-1 text-sm text-green-700">
                The user has been added to the system and will be visible in the users list.
              </p>
            </div>
          </div>
        </div>
      )}

      {submitStatus === 'error' && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex">
            <XCircleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Failed to create user</h3>
              <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
        {/* Personal Information */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">Personal Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name *
                </label>
                <input
                  {...register('firstName')}
                  type="text"
                  id="firstName"
                  autoComplete="off"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                  placeholder="Enter first name"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last Name *
                </label>
                <input
                  {...register('lastName')}
                  type="text"
                  id="lastName"
                  autoComplete="off"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                  placeholder="Enter last name"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>
          </div>

        {/* Contact Information */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address *
                </label>
                <input
                  {...register('email')}
                  type="email"
                  id="email"
                  autoComplete="off"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                  placeholder="Enter email address"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Phone Number *
                </label>
                <input
                  {...register('phone')}
                  type="tel"
                  id="phone"
                  autoComplete="off"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                  placeholder="Enter phone number"
                />
                {errors.phone && (
                  <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                )}
              </div>
            </div>
          </div>

        {/* System Information */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">System Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="idNumber" className="block text-sm font-medium text-gray-700">
                  ID Number *
                </label>
                <input
                  {...register('idNumber')}
                  type="text"
                  id="idNumber"
                  autoComplete="off"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                  placeholder="Enter ID number"
                />
                {errors.idNumber && (
                  <p className="mt-1 text-sm text-red-600">{errors.idNumber.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role *
                </label>
                <select
                  {...register('role')}
                  id="role"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
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
            </div>
          </div>

        {/* Location Information */}
        {!isLocationDisabled && (
          <div>
            <h3 className="text-base font-medium text-gray-900 mb-1">Location Information</h3>
            <p className="text-sm text-gray-600 mb-3">
              Select the user's location. {showWard && 'Select options in order from county to facility.'}
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
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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

        {/* Account Security */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">Account Security</h3>
          <div className="grid grid-cols-1 gap-4">

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <div className="mt-1 relative">
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    autoComplete="new-password"
                    className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>
            </div>
          </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Clear Form
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating User...
                </div>
              ) : (
                'Create User'
              )}
            </button>
        </div>
      </form>
    </div>
  );
}
