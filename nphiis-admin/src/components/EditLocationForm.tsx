'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Location, CreateLocationRequest, LOCATION_TYPES } from '@/types/location';
import { locationApi } from '@/lib/api';
import { 
  CheckCircleIcon,
  XCircleIcon 
} from '@heroicons/react/24/outline';

interface EditLocationFormProps {
  location: Location;
  onLocationUpdated: () => void;
  onClose: () => void;
  parentLocations?: Array<{ id: string; name: string; type?: string }>;
}

// Validation schema
const editLocationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  typeCode: z.string().optional(),
  status: z.enum(['active', 'suspended', 'inactive']).default('active'),
  description: z.string().optional(),
  parentId: z.string().optional(),
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

type FormData = z.infer<typeof editLocationSchema>;

export default function EditLocationForm({ location, onLocationUpdated, onClose, parentLocations = [] }: EditLocationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Parse address fields
  const parseAddress = (address?: string) => {
    if (!address) return { line: '', city: '', state: '', postalCode: '', country: '' };
    
    // Simple parsing - you might want to enhance this based on your address format
    const parts = address.split(',').map(p => p.trim());
    return {
      line: parts[0] || '',
      city: parts[1] || '',
      state: parts[2] || '',
      postalCode: '',
      country: '',
    };
  };

  const addressParts = parseAddress(location.address);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(editLocationSchema),
    mode: 'onChange',
    defaultValues: {
      name: location.name || '',
      typeCode: location.typeCode || '',
      status: location.status || 'active',
      description: location.description || '',
      parentId: location.parentId || '',
      addressLine: addressParts.line,
      city: addressParts.city,
      state: addressParts.state,
      postalCode: addressParts.postalCode,
      country: addressParts.country,
      phone: location.phone || '',
      email: location.email || '',
      latitude: location.position?.latitude?.toString() || '',
      longitude: location.position?.longitude?.toString() || '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const locationData: Partial<CreateLocationRequest> = {
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
      } else {
        // Clear position if coordinates are empty
        locationData.position = undefined;
      }

      await locationApi.updateLocation(location.id, locationData);
      setSubmitStatus('success');
      setTimeout(() => {
        onLocationUpdated();
        onClose();
      }, 1500);
    } catch (error: any) {
      setSubmitStatus('error');
      const errorMessage = error.message || 'Failed to update location. Please try again.';
      setErrorMessage(errorMessage);
      console.error('Error updating location:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter out the current location from parent locations to prevent circular references
  const availableParentLocations = parentLocations.filter(p => p.id !== location.id);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-medium text-gray-900">Edit Location: {location.name}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="w-full">
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Update location information in the FHIR server
              </p>
            </div>

            {/* Status Messages */}
            {submitStatus === 'success' && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-3">
                <div className="flex">
                  <CheckCircleIcon className="h-5 w-5 text-green-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Location updated successfully!</h3>
                    <p className="mt-1 text-sm text-green-700">
                      The location has been updated in the FHIR server.
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
                    <h3 className="text-sm font-medium text-red-800">Failed to update location</h3>
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

                  <div>
                    <label htmlFor="parentId" className="block text-sm font-medium text-gray-700">
                      Parent Location
                    </label>
                    <select
                      {...register('parentId')}
                      id="parentId"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                    >
                      <option value="">None (Top Level)</option>
                      {availableParentLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} {loc.type ? `(${loc.type})` : ''}
                        </option>
                      ))}
                    </select>
                    {errors.parentId && (
                      <p className="mt-1 text-sm text-red-600">{errors.parentId.message}</p>
                    )}
                  </div>

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
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Updating Location...
                    </div>
                  ) : (
                    'Update Location'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

