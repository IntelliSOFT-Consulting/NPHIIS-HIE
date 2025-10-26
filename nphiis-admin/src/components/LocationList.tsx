'use client';

import { useState, useEffect } from 'react';
import { Location, LOCATION_TYPES } from '@/types/location';
import { locationApi } from '@/lib/api';
import { 
  MagnifyingGlassIcon, 
  EyeIcon, 
  PencilIcon, 
  TrashIcon,
  MapPinIcon,
  PlusIcon,
  PhoneIcon,
  EnvelopeIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import EditLocationForm from './EditLocationForm';
import DeleteLocationModal from './DeleteLocationModal';

interface LocationListProps {
  onCreateLocation: () => void;
  refreshTrigger?: number;
}

export default function LocationList({ onCreateLocation, refreshTrigger }: LocationListProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadLocations();
    }
  }, [refreshTrigger]);

  const loadLocations = async () => {
    try {
      setLoading(true);
      setError(null);
      const locationData = await locationApi.getLocations();
      setLocations(locationData);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load locations. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error loading locations:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLocations = locations.filter(location => {
    const matchesSearch = 
      (location.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (location.type?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (location.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (location.address?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    
    const matchesType = !filterType || location.typeCode === filterType;
    
    return matchesSearch && matchesType;
  });

  const handleConfirmDelete = async () => {
    if (!deletingLocation) return;

    const locationId = deletingLocation.id;
    try {
      await locationApi.deleteLocation(locationId);
      setLocations(locations.filter(loc => loc.id !== locationId));
      alert('Location deleted successfully');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete location';
      alert(errorMessage);
      console.error('Error deleting location:', err);
      throw err;
    }
  };

  const handleLocationUpdated = () => {
    loadLocations();
  };

  const getStatusBadgeColor = (status?: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'suspended':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeBadgeColor = (typeCode?: string) => {
    const colors: Record<string, string> = {
      'COUNTRY': 'bg-purple-100 text-purple-800',
      'COUNTY': 'bg-blue-100 text-blue-800',
      'SUBCOUNTY': 'bg-indigo-100 text-indigo-800',
      'WARD': 'bg-green-100 text-green-800',
      'FACILITY': 'bg-orange-100 text-orange-800',
      'COMMUNITY': 'bg-teal-100 text-teal-800',
    };
    return colors[typeCode || ''] || 'bg-gray-100 text-gray-800';
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
            <h2 className="text-xl font-semibold text-gray-900">Locations Management</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage FHIR locations in the system
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Total: {locations.length} locations
            </div>
            <button
              onClick={onCreateLocation}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Location
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="mt-4 flex gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search locations by name, type, description, or address..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="">All Types</option>
              {LOCATION_TYPES.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.display}
                </option>
              ))}
            </select>
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
              <h3 className="text-sm font-medium text-red-800">Error loading locations</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Locations Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {filteredLocations.length === 0 ? (
          <div className="text-center py-12">
            <MapPinIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No locations found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || filterType ? 'Try adjusting your search or filters.' : 'Get started by creating a new location.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type & Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLocations.map((location) => (
                  <tr key={location.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <MapPinIcon className="h-5 w-5 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {location.name}
                          </div>
                          {location.description && (
                            <div className="text-sm text-gray-500">
                              {location.description.length > 50 
                                ? `${location.description.substring(0, 50)}...` 
                                : location.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        {location.type && (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeBadgeColor(location.typeCode)}`}>
                            {location.type}
                          </span>
                        )}
                        <br />
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(location.status)}`}>
                          {location.status || 'active'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {location.parentName || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 space-y-1">
                        {location.phone && (
                          <div className="flex items-center">
                            <PhoneIcon className="h-4 w-4 text-gray-400 mr-1" />
                            {location.phone}
                          </div>
                        )}
                        {location.email && (
                          <div className="flex items-center">
                            <EnvelopeIcon className="h-4 w-4 text-gray-400 mr-1" />
                            {location.email}
                          </div>
                        )}
                        {!location.phone && !location.email && '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedLocation(location)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                          title="View details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingLocation(location)}
                          className="text-indigo-600 hover:text-indigo-900 p-1 rounded hover:bg-indigo-50"
                          title="Edit location"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingLocation(location)}
                          className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                          title="Delete location"
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

      {/* View Location Details Modal */}
      {selectedLocation && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <MapPinIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {selectedLocation.name}
                    </h3>
                    <p className="text-sm text-gray-500">Location ID: {selectedLocation.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Status and Type Banner */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {selectedLocation.type && (
                      <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getTypeBadgeColor(selectedLocation.typeCode)}`}>
                        {selectedLocation.type}
                      </span>
                    )}
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusBadgeColor(selectedLocation.status)}`}>
                      {selectedLocation.status || 'active'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <MapPinIcon className="h-5 w-5 mr-2 text-blue-600" />
                    Basic Information
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Name</label>
                      <p className="text-sm text-gray-900">{selectedLocation.name}</p>
                    </div>
                    {selectedLocation.description && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <p className="text-sm text-gray-900">{selectedLocation.description}</p>
                      </div>
                    )}
                    {selectedLocation.parentName && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Parent Location</label>
                        <p className="text-sm text-gray-900">{selectedLocation.parentName}</p>
                      </div>
                    )}
                    {selectedLocation.address && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <p className="text-sm text-gray-900">{selectedLocation.address}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Contact & Coordinates */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Contact & Coordinates</h4>
                  <div className="space-y-4">
                    {selectedLocation.phone && (
                      <div className="flex items-start space-x-3">
                        <PhoneIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700">Phone</label>
                          <p className="text-sm text-gray-900">{selectedLocation.phone}</p>
                        </div>
                      </div>
                    )}
                    {selectedLocation.email && (
                      <div className="flex items-start space-x-3">
                        <EnvelopeIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700">Email</label>
                          <p className="text-sm text-gray-900">{selectedLocation.email}</p>
                        </div>
                      </div>
                    )}
                    {selectedLocation.position && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Coordinates</label>
                        <p className="text-sm text-gray-900">
                          Lat: {selectedLocation.position.latitude}, Lng: {selectedLocation.position.longitude}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setSelectedLocation(null);
                      setEditingLocation(selectedLocation);
                    }}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <PencilIcon className="h-4 w-4 mr-2" />
                    Edit Location
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition duration-150 ease-in-out"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Location Modal */}
      {editingLocation && (
        <EditLocationForm
          location={editingLocation}
          onLocationUpdated={handleLocationUpdated}
          onClose={() => setEditingLocation(null)}
          parentLocations={locations.filter(l => l.id !== editingLocation.id)}
        />
      )}

      {/* Delete Location Modal */}
      {deletingLocation && (
        <DeleteLocationModal
          location={deletingLocation}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingLocation(null)}
        />
      )}
    </div>
  );
}

