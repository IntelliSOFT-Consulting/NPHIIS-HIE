'use client';

import { useState } from 'react';
import LocationsView from '@/components/LocationsView';
import CreateLocationForm from '@/components/CreateLocationForm';

export default function LocationsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCreated = () => {
    setShowCreate(false);
    setRefreshTrigger((v) => v + 1);
  };

  return (
    <>
      <LocationsView
        onCreateLocation={() => setShowCreate(true)}
        refreshTrigger={refreshTrigger}
      />

      {showCreate && (
        <div className="fixed inset-0 bg-nphi-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-card-lg w-full max-w-5xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-nphi-100/60">
              <h3 className="text-lg font-semibold text-nphi-900">Create New Location</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <CreateLocationForm onLocationCreated={handleCreated} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
