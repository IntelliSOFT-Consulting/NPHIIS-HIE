"use client";

import { useAuth } from "@/lib/auth-context";
import ReportsSection from "./ReportsSection";

export default function SubCountyDashboardPanel() {
  const { locationInfo, user } = useAuth();
  const subCountyName = locationInfo?.subCountyName ?? "your sub-county";
  const countyName = locationInfo?.countyName;

  if (!locationInfo?.subCounty) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-nphi-900">
          Welcome{user?.name ? `, ${user.name}` : ""}
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          No sub-county is attached to your account yet. Ask an administrator to
          set your scope.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card-lg p-6 bg-nphi-gradient text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <h2 className="text-2xl font-semibold relative">{subCountyName}</h2>
        <p className="text-sm text-nphi-100 mt-1 relative">
          Sub-county surveillance overview{countyName ? ` - ${countyName}` : ""}
        </p>
      </div>

      <ReportsSection
        subtitle={`VHF, IDSR and AFP dashboards for ${subCountyName}`}
      />
    </div>
  );
}
