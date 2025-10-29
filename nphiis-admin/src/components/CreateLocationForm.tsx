'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreateLocationRequest, LOCATION_TYPES, Location } from '@/types/location';
import { locationApi } from '@/lib/api';
import { 
  MapPinIcon,
  CheckCircleIcon,
  XCircleIcon 
} from '@heroicons/react/24/outline';

interface CreateLocationFormProps {
  onLocationCreated: () => void;
}

// Validation schema
const createLocationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  typeCode: z.string().optional(),
  status: z.enum(['active', 'suspended', 'inactive']).default('active'),
  description: z.string().optional(),
  parentId: z.string().optional(),
  // Additional fields for cascading dropdowns
  countyId: z.string().optional(),
  subCountyId: z.string().optional(),
  wardId: z.string().optional(),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
});

type FormData = z.infer<typeof createLocationSchema>;

export default function CreateLocationForm({ onLocationCreated }: CreateLocationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [parentLocations, setParentLocations] = useState<Location[]>([]);
  const [loadingParentLocations, setLoadingParentLocations] = useState(false);
  
  // State for cascading dropdowns
  const [counties, setCounties] = useState<Location[]>([]);
  const [subCounties, setSubCounties] = useState<Location[]>([]);
  const [wards, setWards] = useState<Location[]>([]);
  const [loadingCounties, setLoadingCounties] = useState(false);
  const [loadingSubCounties, setLoadingSubCounties] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(createLocationSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      typeCode: '',
      status: 'active',
      description: '',
      parentId: '',
      countyId: '',
      subCountyId: '',
      wardId: '',
      addressLine: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      phone: '',
      email: '',
      latitude: '',
      longitude: '',
    },
  });

  // Watch fields for cascading logic
  const selectedTypeCode = watch('typeCode');
  const selectedParentId = watch('parentId');
  const selectedCountyId = watch('countyId');
  const selectedSubCountyId = watch('subCountyId');

  // Fetch parent locations based on the selected type
  useEffect(() => {
    const fetchParentLocations = async () => {
      if (!selectedTypeCode) {
        setParentLocations([]);
        return;
      }

      // Determine what type of parent locations to fetch
      let parentTypeCode: string | undefined;
      
      if (selectedTypeCode === 'COUNTY') {
        parentTypeCode = 'COUNTRY';
      } else if (selectedTypeCode === 'SUB-COUNTY') {
        parentTypeCode = 'COUNTY';
      } else if (selectedTypeCode === 'COUNTRY') {
        // Country has no parent
        setParentLocations([]);
        setValue('parentId', '');
        return;
      }
      
      // For WARD and FACILITY, we'll use cascading dropdowns instead
      if (selectedTypeCode === 'WARD' || selectedTypeCode === 'FACILITY') {
        setParentLocations([]);
        return;
      }

      if (parentTypeCode) {
        setLoadingParentLocations(true);
        try {
          const response = await locationApi.getLocations(1, 1000, parentTypeCode);
          setParentLocations(response.locations);
        } catch (error) {
          console.error('Error fetching parent locations:', error);
        } finally {
          setLoadingParentLocations(false);
        }
      }
    };

    fetchParentLocations();
  }, [selectedTypeCode, setValue]);

  // Fetch counties for WARD and FACILITY types
  useEffect(() => {
    const fetchCounties = async () => {
      if (selectedTypeCode === 'WARD' || selectedTypeCode === 'FACILITY') {
        setLoadingCounties(true);
        try {
          const response = await locationApi.getLocations(1, 1000, 'COUNTY');
          setCounties(response.locations);
        } catch (error) {
          console.error('Error fetching counties:', error);
        } finally {
          setLoadingCounties(false);
        }
      } else {
        setCounties([]);
        setSubCounties([]);
        setWards([]);
      }
    };

    fetchCounties();
  }, [selectedTypeCode]);

  // Fetch sub-counties when county is selected (for WARD and FACILITY)
  useEffect(() => {
    const fetchSubCounties = async () => {
      if ((selectedTypeCode === 'WARD' || selectedTypeCode === 'FACILITY') && selectedCountyId) {
        setLoadingSubCounties(true);
        try {
          const response = await locationApi.getLocations(1, 1000, 'SUB-COUNTY', undefined, selectedCountyId);
          setSubCounties(response.locations);
          // Reset sub-county and ward selections
          setValue('subCountyId', '');
          setValue('wardId', '');
        } catch (error) {
          console.error('Error fetching sub-counties:', error);
        } finally {
          setLoadingSubCounties(false);
        }
      } else {
        setSubCounties([]);
        setWards([]);
      }
    };

    fetchSubCounties();
  }, [selectedCountyId, selectedTypeCode, setValue]);

  // Fetch wards when sub-county is selected (for FACILITY only)
  useEffect(() => {
    const fetchWards = async () => {
      if (selectedTypeCode === 'FACILITY' && selectedSubCountyId) {
        setLoadingWards(true);
        try {
          const response = await locationApi.getLocations(1, 1000, 'WARD', undefined, selectedSubCountyId);
          setWards(response.locations);
          // Reset ward selection
          setValue('wardId', '');
        } catch (error) {
          console.error('Error fetching wards:', error);
        } finally {
          setLoadingWards(false);
        }
      } else {
        setWards([]);
      }
    };

    fetchWards();
  }, [selectedSubCountyId, selectedTypeCode, setValue]);

  // Watch ward selection for FACILITY type
  const selectedWardId = watch('wardId');

  // Auto-set parentId based on cascading selections
  useEffect(() => {
    if (selectedTypeCode === 'WARD' && selectedSubCountyId) {
      // For WARD, parent is the selected sub-county
      setValue('parentId', selectedSubCountyId);
    } else if (selectedTypeCode === 'FACILITY' && selectedWardId) {
      // For FACILITY, parent is the selected ward
      setValue('parentId', selectedWardId);
    }
  }, [selectedTypeCode, selectedSubCountyId, selectedWardId, setValue]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const locationData: CreateLocationRequest = {
        name: data.name,
        typeCode: data.typeCode || undefined,
        type: LOCATION_TYPES.find(t => t.code === data.typeCode)?.display,
        status: data.status,
        description: data.description || undefined,
        parentId: data.parentId || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
      };

      // Build address if any address fields are provided
      if (data.addressLine || data.city || data.state || data.postalCode || data.country) {
        const addressParts = [data.addressLine, data.city, data.state, data.postalCode, data.country]
          .filter(Boolean);
        
        locationData.address = {
          text: addressParts.join(', '),
          line: data.addressLine ? [data.addressLine] : undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          postalCode: data.postalCode || undefined,
          country: data.country || undefined,
        };
      }

      // Build position if latitude and longitude are provided
      if (data.latitude && data.longitude) {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          locationData.position = {
            latitude: lat,
            longitude: lng,
          };
        }
      }

      await locationApi.createLocation(locationData);
      setSubmitStatus('success');
      reset();
      setTimeout(() => {
        onLocationCreated();
      }, 2000);
    } catch (error: any) {
      setSubmitStatus('error');
      const errorMessage = error.message || 'Failed to create location. Please try again.';
      setErrorMessage(errorMessage);
      console.error('Error creating location:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          Add a new FHIR location to the system
        </p>
      </div>

      {/* Status Messages */}
      {submitStatus === 'success' && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-3">
          <div className="flex">
            <CheckCircleIcon className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Location created successfully!</h3>
              <p className="mt-1 text-sm text-green-700">
                The location has been added to the FHIR server.
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
              <h3 className="text-sm font-medium text-red-800">Failed to create location</h3>
              <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
        {/* Basic Information */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Location Name *
              </label>
              <input
                {...register('name')}
                type="text"
                id="name"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="Enter location name"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="typeCode" className="block text-sm font-medium text-gray-700">
                Location Type
              </label>
              <select
                {...register('typeCode')}
                id="typeCode"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
              >
                <option value="">Select a type</option>
                {LOCATION_TYPES.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.display}
                  </option>
                ))}
              </select>
              {errors.typeCode && (
                <p className="mt-1 text-sm text-red-600">{errors.typeCode.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                {...register('status')}
                id="status"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="inactive">Inactive</option>
              </select>
              {errors.status && (
                <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
              )}
            </div>

            {/* Parent Location - conditional rendering based on type */}
            {selectedTypeCode === 'COUNTRY' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Parent Location
                </label>
                <input
                  type="text"
                  disabled
                  value="None (Top Level)"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm bg-gray-100 text-gray-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Country is always at the top level</p>
              </div>
            )}

            {(selectedTypeCode === 'COUNTY' || selectedTypeCode === 'SUB-COUNTY') && (
              <div>
                <label htmlFor="parentId" className="block text-sm font-medium text-gray-700">
                  Parent Location {loadingParentLocations && <span className="text-gray-500 text-xs">(Loading...)</span>}
                </label>
                <select
                  {...register('parentId')}
                  id="parentId"
                  disabled={loadingParentLocations}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select {selectedTypeCode === 'COUNTY' ? 'country' : 'county'}</option>
                  {parentLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                {errors.parentId && (
                  <p className="mt-1 text-sm text-red-600">{errors.parentId.message}</p>
                )}
              </div>
            )}

            {selectedTypeCode === 'WARD' && (
              <>
                <div>
                  <label htmlFor="countyId" className="block text-sm font-medium text-gray-700">
                    County {loadingCounties && <span className="text-gray-500 text-xs">(Loading...)</span>}
                  </label>
                  <select
                    {...register('countyId')}
                    id="countyId"
                    disabled={loadingCounties}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select county</option>
                    {counties.map((county) => (
                      <option key={county.id} value={county.id}>
                        {county.name}
                      </option>
                    ))}
                  </select>
                  {errors.countyId && (
                    <p className="mt-1 text-sm text-red-600">{errors.countyId.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="subCountyId" className="block text-sm font-medium text-gray-700">
                    Sub-County (Parent) {loadingSubCounties && <span className="text-gray-500 text-xs">(Loading...)</span>}
                  </label>
                  <select
                    {...register('subCountyId')}
                    id="subCountyId"
                    disabled={loadingSubCounties || !selectedCountyId}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select sub-county</option>
                    {subCounties.map((subCounty) => (
                      <option key={subCounty.id} value={subCounty.id}>
                        {subCounty.name}
                      </option>
                    ))}
                  </select>
                  {!selectedCountyId && (
                    <p className="mt-1 text-xs text-gray-500">Select a county first</p>
                  )}
                  {errors.subCountyId && (
                    <p className="mt-1 text-sm text-red-600">{errors.subCountyId.message}</p>
                  )}
                </div>
              </>
            )}

            {selectedTypeCode === 'FACILITY' && (
              <>
                <div>
                  <label htmlFor="countyId" className="block text-sm font-medium text-gray-700">
                    County {loadingCounties && <span className="text-gray-500 text-xs">(Loading...)</span>}
                  </label>
                  <select
                    {...register('countyId')}
                    id="countyId"
                    disabled={loadingCounties}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select county</option>
                    {counties.map((county) => (
                      <option key={county.id} value={county.id}>
                        {county.name}
                      </option>
                    ))}
                  </select>
                  {errors.countyId && (
                    <p className="mt-1 text-sm text-red-600">{errors.countyId.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="subCountyId" className="block text-sm font-medium text-gray-700">
                    Sub-County {loadingSubCounties && <span className="text-gray-500 text-xs">(Loading...)</span>}
                  </label>
                  <select
                    {...register('subCountyId')}
                    id="subCountyId"
                    disabled={loadingSubCounties || !selectedCountyId}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select sub-county</option>
                    {subCounties.map((subCounty) => (
                      <option key={subCounty.id} value={subCounty.id}>
                        {subCounty.name}
                      </option>
                    ))}
                  </select>
                  {!selectedCountyId && (
                    <p className="mt-1 text-xs text-gray-500">Select a county first</p>
                  )}
                  {errors.subCountyId && (
                    <p className="mt-1 text-sm text-red-600">{errors.subCountyId.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="wardId" className="block text-sm font-medium text-gray-700">
                    Ward (Parent) {loadingWards && <span className="text-gray-500 text-xs">(Loading...)</span>}
                  </label>
                  <select
                    {...register('wardId')}
                    id="wardId"
                    disabled={loadingWards || !selectedSubCountyId}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select ward</option>
                    {wards.map((ward) => (
                      <option key={ward.id} value={ward.id}>
                        {ward.name}
                      </option>
                    ))}
                  </select>
                  {!selectedSubCountyId && (
                    <p className="mt-1 text-xs text-gray-500">Select a sub-county first</p>
                  )}
                  {errors.wardId && (
                    <p className="mt-1 text-sm text-red-600">{errors.wardId.message}</p>
                  )}
                </div>
              </>
            )}

            <div className="md:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                {...register('description')}
                id="description"
                rows={2}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="Enter location description"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Address Information */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">Address Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="addressLine" className="block text-sm font-medium text-gray-700">
                Street Address
              </label>
              <input
                {...register('addressLine')}
                type="text"
                id="addressLine"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="Enter street address"
              />
              {errors.addressLine && (
                <p className="mt-1 text-sm text-red-600">{errors.addressLine.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                City/Town
              </label>
              <input
                {...register('city')}
                type="text"
                id="city"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="Enter city"
              />
              {errors.city && (
                <p className="mt-1 text-sm text-red-600">{errors.city.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                State/County
              </label>
              <input
                {...register('state')}
                type="text"
                id="state"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="Enter state/county"
              />
              {errors.state && (
                <p className="mt-1 text-sm text-red-600">{errors.state.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700">
                Postal Code
              </label>
              <input
                {...register('postalCode')}
                type="text"
                id="postalCode"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="Enter postal code"
              />
              {errors.postalCode && (
                <p className="mt-1 text-sm text-red-600">{errors.postalCode.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                Country
              </label>
              <input
                {...register('country')}
                type="text"
                id="country"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="Enter country"
              />
              {errors.country && (
                <p className="mt-1 text-sm text-red-600">{errors.country.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone Number
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

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
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
          </div>
        </div>

        {/* Geographic Coordinates */}
        <div>
          <h3 className="text-base font-medium text-gray-900 mb-3">Geographic Coordinates (Optional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="latitude" className="block text-sm font-medium text-gray-700">
                Latitude
              </label>
              <input
                {...register('latitude')}
                type="text"
                id="latitude"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="e.g., -1.2921"
              />
              {errors.latitude && (
                <p className="mt-1 text-sm text-red-600">{errors.latitude.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="longitude" className="block text-sm font-medium text-gray-700">
                Longitude
              </label>
              <input
                {...register('longitude')}
                type="text"
                id="longitude"
                autoComplete="off"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                placeholder="e.g., 36.8219"
              />
              {errors.longitude && (
                <p className="mt-1 text-sm text-red-600">{errors.longitude.message}</p>
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
                Creating Location...
              </div>
            ) : (
              'Create Location'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

