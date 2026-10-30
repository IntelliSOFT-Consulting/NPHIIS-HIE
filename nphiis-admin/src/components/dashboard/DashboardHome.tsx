"use client";

import { useAuth } from "@/lib/auth-context";

import UserRoleBreakdown from "../UserRoleBreakdown";
import CountyDashboardPanel from "./CountyDashboardPanel";
import SubCountyDashboardPanel from "./SubCountyDashboardPanel";
import LabDashboardPanel from "./LabDashboardPanel";
import NationalDashboardPanel from "./NationalDashboardPanel";
import FacilityDashboardPanel from "./FacilityDashboardPanel";
import ClinicianDashboardPanel from "./ClinicianDashboardPanel";
import ReportsSection from "./ReportsSection";

// Role precedence (first match wins). Admin sees the national user
// breakdown + embedded reports. NATIONAL_LAB gets the lab dashboard since its
// users submit results daily. Pure national roles see the nationwide
// dashboards. Geographic scopes run tightest-first so a user carrying several
// claims lands on the most specific view.
export default function DashboardHome() {
  const { hasRole, can } = useAuth();

  if (can('USERS_MANAGE')) {
    return (
      <div className="space-y-4">
        <UserRoleBreakdown />
        <ReportsSection
          title=""
          subtitle=""
          height="calc(100vh - 16rem)"
        />
      </div>
    );
  }

  if (hasRole(["NATIONAL_LAB"])) return <LabDashboardPanel />;

  if (hasRole(["NATIONAL_FOCAL_PERSON", "NATIONAL_VIEWER"])) {
    return <NationalDashboardPanel />;
  }

  if (can('LAB_ACCESS')) return <LabDashboardPanel />;

  if (hasRole(["FACILITY_SURVEILLANCE_FOCAL_PERSON"])) {
    return <FacilityDashboardPanel />;
  }

  if (hasRole(["SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER"])) {
    return <SubCountyDashboardPanel />;
  }

  if (hasRole(["COUNTY_DISEASE_SURVEILLANCE_OFFICER"])) {
    return <CountyDashboardPanel />;
  }

  // VACCINATOR, NURSE, SUPERVISORS and anything else - welcome + shortcuts.
  return <ClinicianDashboardPanel />;
}
