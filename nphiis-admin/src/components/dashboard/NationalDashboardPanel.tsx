"use client";

import { useAuth } from "@/lib/auth-context";
import ReportsSection from "./ReportsSection";

export default function NationalDashboardPanel() {
  const { user, roles } = useAuth();
  const isViewer = roles.includes("NATIONAL_VIEWER");

  return (
    <div className="space-y-6">
      <div className="card-lg p-6 bg-nphi-gradient text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <h2 className="text-2xl font-semibold relative">
          National overview{isViewer ? " - Line list" : ""}
        </h2>
        <p className="text-sm text-nphi-100 mt-1 relative">
          Welcome{user?.name ? `, ${user.name}` : ""}.{" "}
          {isViewer
            ? "Your access is scoped to MOH 505 line-list reports."
            : "Nationwide surveillance dashboards."}
        </p>
      </div>

      <ReportsSection
        subtitle={
          isViewer
            ? "MOH 505 line list"
            : "MOH 502 and MOH 505 dashboards across all counties"
        }
      />
    </div>
  );
}
