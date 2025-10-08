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
  enabled?: boolean;
  createdTimestamp?: number;
  fhirPractitionerId?: string;
  practitionerRole?: string;
  idNumber?: string;
  locationInfo?: LocationInfo;
}

// UserRole is loaded from process.env.USER_ROLES at runtime, not statically typed here.
// To get the allowed roles, use: process.env.USER_ROLES?.split(",") ?? []
export type UserRole = string;

export interface CreateUserRequest {
  idNumber: string;
  password: string;
  email: string;
  role: UserRole;
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
