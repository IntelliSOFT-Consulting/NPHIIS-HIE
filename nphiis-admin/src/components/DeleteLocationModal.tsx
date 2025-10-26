'use client';

import { useState } from 'react';
import { Location } from '@/types/location';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DeleteLocationModalProps {
  location: Location;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function DeleteLocationModal({ location, onConfirm, onClose }: DeleteLocationModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);
    
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete location');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
          </div>
          
          {/* Content */}
          <div className="mt-3 text-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Delete Location</h3>
            <div className="mt-2 px-7 py-3">
              <p className="text-sm text-gray-500">
                Are you sure you want to delete <span className="font-semibold">{location.name}</span>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                This action cannot be undone. Any child locations or resources referencing this location may be affected.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-2 px-4">
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="items-center px-4 py-3">
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </div>
                ) : (
                  'Delete'
                )}
              </button>
              <button
                onClick={onClose}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

