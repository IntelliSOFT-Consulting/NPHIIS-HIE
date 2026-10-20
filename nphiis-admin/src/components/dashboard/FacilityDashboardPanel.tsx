'use client';

import { useAuth } from '@/lib/auth-context';
import ReportsSection from './ReportsSection';

export default function FacilityDashboardPanel() {
  const { locationInfo, user } = useAuth();
  const facilityName = locationInfo?.facilityName ?? 'your facility';

  if (!locationInfo?.facility) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-nphi-900">
          Welcome{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          No facility is attached to your account yet. Ask an administrator to set
          your scope.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card-lg p-6 bg-nphi-gradient text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <h2 className="text-2xl font-semibold relative">{facilityName}</h2>
        <p className="text-sm text-nphi-100 mt-1 relative">
          Facility surveillance overview
        </p>
      </div>

      <ReportsSection subtitle={`VHF, IDSR and AFP dashboards for ${facilityName}`} />
    </div>
  );
}
