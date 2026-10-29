export interface LocationInfo {
  facility: string;
  facilityName: string;
  ward: string;
  wardName: string;
  subCounty: string;
  subCountyName: string;
  county: string;
  countyName: string;
  country: string;
  countryName: string;
}

export interface User {
  id?: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  locationId?: string;
  role?: UserRole;
  /** Slug of the profile from the Roles page, when the user has one. */
  profile?: string;
  enabled?: boolean;
  active?: boolean;
  createdTimestamp?: number;
  fhirPractitionerId?: string;
  practitionerRole?: string;
  idNumber?: string;
  locationInfo?: LocationInfo;
  notificationsEnabled?: boolean;
}

// UserRole values come from hie-auth (GET /provider/roles).
export type UserRole = string;

export interface CreateUserRequest {
  idNumber: string;
  password: string;
  email: string;
  role: UserRole;
  profile?: string;
  firstName: string;
  lastName: string;
  phone: string;
  locationId?: string;
}

export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  createdTimestamp: number;
  attributes?: Record<string, string[]>;
}
