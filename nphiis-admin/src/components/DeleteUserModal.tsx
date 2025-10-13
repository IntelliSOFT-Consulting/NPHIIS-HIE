'use client';

import { useState } from 'react';
import { User } from '@/types/user';
import { 
  ExclamationTriangleIcon,
  XMarkIcon,
  TrashIcon,
  UserIcon
} from '@heroicons/react/24/outline';

interface DeleteUserModalProps {
  user: User;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function DeleteUserModal({ user, onConfirm, onClose }: DeleteUserModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  
  const expectedConfirmText = 'DELETE';
  const canDelete = confirmText === expectedConfirmText;

  const handleDelete = async () => {
    if (!canDelete) return;
    
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Delete error:', error);
      setIsDeleting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-900 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-auto transform transition-all">
        {/* Header */}
        <div className="bg-red-600 rounded-t-lg px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white bg-opacity-20 rounded-full p-2">
              <ExclamationTriangleIcon className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              Delete User Account
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Warning Message */}
          <div className="mb-6">
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    <strong>Warning:</strong> This action cannot be undone. This will permanently delete the user account and all associated data.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* User Information */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <UserIcon className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {user.email || 'No email'}
                </p>
                <p className="text-sm text-gray-500">
                  ID: {user.username}
                </p>
                {user.role && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                    {user.role}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Confirmation Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              To confirm deletion, type <span className="font-mono font-bold text-red-600">{expectedConfirmText}</span> below:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isDeleting}
              placeholder="Type DELETE to confirm"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={!canDelete || isDeleting}
              className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-all ${
                canDelete && !isDeleting
                  ? 'bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Delete User
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

