"use client";

import { useAuth } from "@/lib/auth-context";
import { ADMIN_ROLES, LAB_ROLES, ROLES } from "@/lib/roles";
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
  const { hasRole } = useAuth();

  if (hasRole(ADMIN_ROLES)) {
    return (
      <div className="space-y-8">
        <UserRoleBreakdown />
        <ReportsSection subtitle="MOH 502 and MOH 505 dashboards across all counties" />
      </div>
    );
  }

  if (hasRole([ROLES.NATIONAL_LAB])) return <LabDashboardPanel />;

  if (hasRole([ROLES.NATIONAL_FOCAL_PERSON, ROLES.NATIONAL_VIEWER])) {
    return <NationalDashboardPanel />;
  }

  if (hasRole(LAB_ROLES)) return <LabDashboardPanel />;

  if (hasRole([ROLES.FACILITY_SURVEILLANCE_FOCAL_PERSON])) {
    return <FacilityDashboardPanel />;
  }

  if (hasRole([ROLES.SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER])) {
    return <SubCountyDashboardPanel />;
  }

  if (hasRole([ROLES.COUNTY_DISEASE_SURVEILLANCE_OFFICER])) {
    return <CountyDashboardPanel />;
  }

  // VACCINATOR, NURSE, SUPERVISORS and anything else - welcome + shortcuts.
  return <ClinicianDashboardPanel />;
}
