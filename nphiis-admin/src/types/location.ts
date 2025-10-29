// FHIR Location Types

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirIdentifier {
  system?: string;
  value?: string;
  use?: 'official' | 'temp' | 'secondary';
}

export interface FhirReference {
  reference?: string;
  display?: string;
  type?: string;
}

export interface FhirAddress {
  use?: 'home' | 'work' | 'temp' | 'old';
  type?: 'postal' | 'physical' | 'both';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface FhirPosition {
  longitude: number;
  latitude: number;
  altitude?: number;
}

export interface FhirLocation {
  resourceType: 'Location';
  id?: string;
  identifier?: FhirIdentifier[];
  status?: 'active' | 'suspended' | 'inactive';
  name?: string;
  alias?: string[];
  description?: string;
  mode?: 'instance' | 'kind';
  type?: FhirCodeableConcept[];
  telecom?: Array<{
    system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
    value?: string;
    use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  }>;
  address?: FhirAddress;
  physicalType?: FhirCodeableConcept;
  position?: FhirPosition;
  managingOrganization?: FhirReference;
  partOf?: FhirReference;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'searchset' | 'transaction' | 'collection';
  total?: number;
  entry?: Array<{
    fullUrl?: string;
    resource?: FhirLocation;
  }>;
  link?: Array<{
    relation: string;
    url: string;
  }>;
}

// Simplified location for display
export interface Location {
  id: string;
  name: string;
  type?: string;
  typeCode?: string;
  status?: 'active' | 'suspended' | 'inactive';
  description?: string;
  parentId?: string;
  parentName?: string;
  address?: string;
  phone?: string;
  email?: string;
  position?: FhirPosition;
}

// Paginated location response
export interface PaginatedLocationResponse {
  locations: Location[];
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
  currentPage: number;
}

// For creating/updating locations
export interface CreateLocationRequest {
  name: string;
  type?: string;
  typeCode?: string;
  status?: 'active' | 'suspended' | 'inactive';
  description?: string;
  parentId?: string;
  address?: FhirAddress;
  phone?: string;
  email?: string;
  position?: FhirPosition;
}

// Location type codes used in Kenya health system
export const LOCATION_TYPES = [
  { code: 'COUNTRY', display: 'Country' },
  { code: 'COUNTY', display: 'County' },
  { code: 'SUB-COUNTY', display: 'Sub-County' },
  { code: 'WARD', display: 'Ward' },
  { code: 'FACILITY', display: 'Health Facility' },
] as const;

export type LocationTypeCode = typeof LOCATION_TYPES[number]['code'];

