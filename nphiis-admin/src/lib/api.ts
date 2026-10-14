import { User, CreateUserRequest, LocationInfo } from '@/types/user';
import type { CallbackLogsApiResponse } from '@/types/callback-log';
import type {
  EpidRetryBatchResponse,
  MissingEpidEncountersResponse,
  NotificationLogsApiResponse,
} from '@/types/notification-log';

// API host configurations
const API_HOST = process.env.NEXT_PUBLIC_API_HOST;
console.log("API HOST: ", API_HOST)
const FHIR_BASE_URL = '/api/fhir';

// Wraps fetch() to inject the current bearer token for /api/fhir calls. The
// Next.js proxy verifies the token before forwarding to HAPI, so every FHIR
// request from the browser must carry one.
export async function fhirFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/fhir+json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

// Authentication types
interface LoginRequest {
  idNumber: string;
  password: string;
}

interface LoginResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  'not-before-policy'?: number;
  session_state?: string;
  scope?: string;
  status: 'success' | 'error';
  error?: string;
}

interface UserInfo {
  firstName: string;
  lastName: string;
  role: string;
  id: string;
  idNumber: string;
  fullNames: string;
  phone: string | null;
  email: string;
  fhirPractitionerId?: string;
  locationInfo?: LocationInfo;
}

interface UserInfoResponse {
  status: 'success' | 'error';
  user?: UserInfo;
  error?: string;
}

interface UsersApiResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  status: 'success' | 'error';
  error?: string;
}

interface RolesApiResponse {
  roles: string[];
  status: 'success' | 'error';
  error?: string;
}

/** Canonical application roles from hie-auth (source of truth). */
export const rolesApi = {
  getRoles: async (): Promise<string[]> => {
    const response = await fetch('/api/provider/roles', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    const data: RolesApiResponse = await response.json();
    if (data.status !== 'success' || !Array.isArray(data.roles)) {
      throw new Error(data.error || 'Failed to fetch roles');
    }
    return data.roles;
  },
};


// User management API functions
export const userApi = {
  // Get users from real API with pagination
  getUsers: async (
    accessToken?: string,
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<UsersApiResponse> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search && search.trim()) {
        params.set('search', search.trim());
      }
      const response = await fetch(`/api/provider/users?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': 'frontend_lang=en_US'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data: UsersApiResponse = await response.json();
      
      if (data.status === 'success') {
        // Normalize users array to ensure each user has 'active' field
        // Backend returns 'enabled' from Keycloak, map it to 'active' for UI consistency
        const normalizedUsers = data.users.map(user => ({
          ...user,
          active: user.active ?? user.enabled ?? true, // Map enabled to active if active is not present
          enabled: user.enabled ?? user.active ?? true, // Ensure enabled is also set
          notificationsEnabled: user.notificationsEnabled === true,
        }));
        
        return {
          ...data,
          users: normalizedUsers
        };
      } else {
        const error = new Error(data.error || 'Failed to fetch users');
        (error as any).response = { data, status: response.status };
        throw error;
      }
    } catch (error) {
      console.error('Get users error:', error);
      throw error;
    }
  },

  // Get user by ID using real API
  getUserById: async (userId: string, accessToken?: string): Promise<User> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    
    try {
      const response = await fetch(`/api/provider/user/${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': 'frontend_lang=en_US'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        // Map the API response to our User interface with full location details
        // Backend returns 'status' from Practitioner.active, map it to 'active'
        const isActive = data.user.status ?? data.user.enabled ?? true;
        return {
          id: data.user.id,
          username: data.user.idNumber,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phone: data.user.phone,
          locationId: data.user.locationInfo?.facility || '',
          role: data.user.role || data.user.practitionerRole,
          enabled: data.user.enabled ?? isActive, // Use enabled if provided, otherwise derive from status
          active: isActive, // Map status/enabled to active for UI display
          createdTimestamp: data.user.createdTimestamp,
          fhirPractitionerId: data.user.fhirPractitionerId,
          practitionerRole: data.user.practitionerRole,
          idNumber: data.user.idNumber,
          locationInfo: data.user.locationInfo ? {
            facility: data.user.locationInfo.facility || '',
            facilityName: data.user.locationInfo.facilityName || '',
            ward: data.user.locationInfo.ward || '',
            wardName: data.user.locationInfo.wardName || '',
            subCounty: data.user.locationInfo.subCounty || '',
            subCountyName: data.user.locationInfo.subCountyName || '',
            county: data.user.locationInfo.county || '',
            countyName: data.user.locationInfo.countyName || '',
            country: data.user.locationInfo.country || '',
            countryName: data.user.locationInfo.countryName || ''
          } : undefined
        };
      } else {
        const error = new Error(data.error || 'Failed to fetch user');
        (error as any).response = { data, status: response.status };
        throw error;
      }
    } catch (error) {
      console.error('Get user by ID error:', error);
      throw error;
    }
  },

  // Create new user using real API
  createUser: async (userData: CreateUserRequest, accessToken?: string): Promise<User> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    
    try {
      const response = await fetch(`/api/provider/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'frontend_lang=en_US'
        },
        body: JSON.stringify({
          idNumber: userData.idNumber,
          password: userData.password,
          email: userData.email,
          role: userData.role,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: userData.phone,
          facility: userData.locationId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      
      // Return a User object that matches our interface
      // Newly created users are active by default (can log in successfully)
      return {
        id: data.id || Date.now().toString(),
        username: userData.idNumber, // Map idNumber to username for display
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        role: userData.role,
        enabled: true,
        active: true, // Newly created users are active
        createdTimestamp: data.createdTimestamp,
      };
    } catch (error) {
      console.error('Create user error:', error);
      throw error;
    }
  },

  // Update user using real API
  updateUser: async (username: string, userData: Partial<User>, accessToken?: string): Promise<User> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }

    try {
      // Map form data to API format
      const apiPayload: any = {};
      
      // Map the form data fields to API format
      if (userData.firstName) {
        apiPayload.firstName = userData.firstName;
      }
      
      if (userData.lastName) {
        apiPayload.lastName = userData.lastName;
      }
      
      if (userData.email) {
        apiPayload.email = userData.email;
      }
      
      if (userData.phone) {
        apiPayload.phone = userData.phone;
      }
      
      if (userData.role) {
        apiPayload.role = userData.role;
      }
      
      if (userData.locationId) {
        apiPayload.facilityCode = userData.locationId;
      }
      
      // Use the PUT /users/{username} endpoint with username (idNumber)
      const response = await fetch(`/api/provider/users/${username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': 'frontend_lang=en_US'
        },
        body: JSON.stringify(apiPayload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Create a proper Error object with the API error message
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        // Attach the full response data for better error handling
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        // Map the API response to our User interface
        // Backend may return 'status' from Practitioner.active, map it to 'active'
        const isActive = data.user.status ?? data.user.enabled ?? true;
        return {
          id: data.user.id,
          username: data.user.idNumber,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phone: data.user.phone,
          locationId: data.user.locationInfo?.facility || '',
          role: data.user.role || data.user.practitionerRole,
          enabled: data.user.enabled ?? isActive, // Use enabled if provided, otherwise derive from status
          active: isActive, // Map status/enabled to active for UI display
          createdTimestamp: data.user.createdTimestamp
        };
      } else {
        // Handle API error responses with proper structure
        const error = new Error(data.error || 'Failed to update user');
        (error as any).response = { data, status: response.status };
        throw error;
      }
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  },

  // Delete user using real API
  deleteUser: async (userId: string, accessToken?: string): Promise<void> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    
    try {
      const response = await fetch(`/api/provider/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Cookie': 'frontend_lang=en_US'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      
      if (data.status !== 'success') {
        const error = new Error(data.error || 'Failed to delete user');
        (error as any).response = { data, status: response.status };
        throw error;
      }
    } catch (error) {
      console.error('Delete user error:', error);
      throw error;
    }
  },

  // Send password reset code to user's email
  sendPasswordResetCode: async (idNumber: string, email: string): Promise<void> => {
    try {
      const response = await fetch(`/api/provider/reset-password?idNumber=${encodeURIComponent(idNumber)}&email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'Cookie': 'frontend_lang=en_US'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      
      if (data.status !== 'success') {
        const error = new Error(data.error || 'Failed to send reset code');
        (error as any).response = { data, status: response.status };
        throw error;
      }
    } catch (error) {
      console.error('Send reset code error:', error);
      throw error;
    }
  },

  // Reset user password using real API
  resetPassword: async (userId: string, newPassword: string, resetCode: string): Promise<void> => {
    try {
      const response = await fetch(`/api/provider/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'frontend_lang=en_US'
        },
        body: JSON.stringify({
          idNumber: userId,
          password: newPassword,
          resetCode: resetCode
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      
      if (data.status !== 'success') {
        const error = new Error(data.error || 'Failed to reset password');
        (error as any).response = { data, status: response.status };
        throw error;
      }
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  },

  // Send welcome email with new credentials (admin only)
  sendWelcomeEmail: async (username: string, accessToken: string): Promise<void> => {
    try {
      const response = await fetch(`/api/provider/welcome-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': 'frontend_lang=en_US'
        },
        body: JSON.stringify({ username })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      
      if (data.status !== 'success') {
        const error = new Error(data.error || 'Failed to send welcome email');
        (error as any).response = { data, status: response.status };
        throw error;
      }
    } catch (error) {
      console.error('Send welcome email error:', error);
      throw error;
    }
  },

  // Enable/disable user - Note: This functionality is not directly available in provider-auth.ts
  // The API doesn't have a specific endpoint for toggling user status
  // This would need to be implemented in the backend or handled differently
  toggleUserStatus: async (userId: string, enabled: boolean, accessToken?: string): Promise<User> => {
    throw new Error('Toggle user status functionality is not available in the current API');
  },

  toggleUserNotifications: async (
    username: string,
    enabled: boolean,
    accessToken?: string,
  ): Promise<User> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }

    try {
      const response = await fetch(
        `/api/provider/users/${encodeURIComponent(username)}/notifications-enabled`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Cookie: 'frontend_lang=en_US',
          },
          body: JSON.stringify({ enabled }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
      }

      const data = await response.json();
      if (data.status !== 'success') {
        const error = new Error(data.error || 'Failed to update notification settings');
        (error as any).response = { data, status: response.status };
        throw error;
      }

      return {
        ...data.user,
        notificationsEnabled: data.user.notificationsEnabled === true,
      };
    } catch (error) {
      console.error('Toggle user notifications error:', error);
      throw error;
    }
  },
};

// Helper function to get access token from localStorage
export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const savedAuth = localStorage.getItem('nphiis-admin-auth');
    if (savedAuth) {
      const authData = JSON.parse(savedAuth);
      return authData.accessToken || null;
    }
  } catch (error) {
    console.error('Error getting access token:', error);
  }
  return null;
};

// Helper function to check if error is unauthorized
export const isUnauthorizedError = (error: any): boolean => {
  return error?.response?.status === 401 || error?.response?.status === 403;
};

// Helper function to handle logout and redirect to login
export const handleUnauthorized = (): void => {
  if (typeof window === 'undefined') return;
  
  // Clear authentication data
  localStorage.removeItem('nphiis-admin-auth');
  
  // Redirect to login page
  window.location.href = '/login';
};

// Authentication API functions
export const authApi = {
  // Login with ID number and password
  login: async (idNumber: string, password: string): Promise<LoginResponse> => {
    try {
      const response = await fetch(`/api/provider/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'frontend_lang=en_US'
        },
        body: JSON.stringify({
          idNumber,
          password
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          status: 'error',
          error: errorData.error || `HTTP error ${response.status}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Login error:', error);
      return {
        status: 'error',
        error: 'Network error occurred'
      };
    }
  },

  // Get user info using access token
  getUserInfo: async (accessToken: string): Promise<UserInfoResponse> => {
    try {
      const response = await fetch(`/api/provider/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': 'frontend_lang=en_US'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          status: 'error',
          error: errorData.error || `HTTP error ${response.status}`,
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Get user info error:', error);
      return {
        status: 'error',
        error: 'Network error occurred'
      };
    }
  },

  // Check if user is administrator
  isAdministrator: async (idNumber: string, password: string): Promise<{ success: boolean; userInfo?: UserInfo; accessToken?: string; error?: string }> => {
    try {
      // First, attempt to login
      const loginResponse = await authApi.login(idNumber, password);
      
      if (loginResponse.status !== 'success' || !loginResponse.access_token) {
        return {
          success: false,
          error: loginResponse.error || 'Login failed'
        };
      }

      // Get user info
      const userInfoResponse = await authApi.getUserInfo(loginResponse.access_token);
      
      if (userInfoResponse.status !== 'success' || !userInfoResponse.user) {
        return {
          success: false,
          error: userInfoResponse.error || 'Failed to get user info'
        };
      }

      // RBAC happens client-side via Navigation/feature checks. Any role with
      // a session is allowed in; the UI hides tabs they can't access.
      return {
        success: true,
        userInfo: userInfoResponse.user,
        accessToken: loginResponse.access_token,
      };
    } catch (error) {
      console.error('Administrator check error:', error);
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }
};

// FHIR types
export interface FhirCounty {
  id: string;
  name: string;
  code?: string;
}

export interface FhirSubCounty {
  id: string;
  name: string;
  countyId: string;
  countyName?: string;
}

export interface FhirWard {
  id: string;
  name: string;
  subCountyId: string;
  subCountyName?: string;
}

export interface FhirFacility {
  id: string;
  name: string;
  wardId: string;
  wardName?: string;
}

interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

interface FhirType {
  coding?: FhirCoding[];
}

interface FhirPartOf {
  reference?: string;
  display?: string;
}

interface FhirLocation {
  resourceType: string;
  id: string;
  name?: string;
  type?: FhirType[];
  partOf?: FhirPartOf;
}

interface FhirBundleEntry {
  fullUrl?: string;
  resource?: FhirLocation;
}

interface FhirBundle {
  resourceType: string;
  type: string;
  entry?: FhirBundleEntry[];
  link?: Array<{
    relation: string;
    url: string;
  }>;
}

// Pull every descendant Location under `rootId` in a single FHIR bundle using
// `_revinclude:iterate=Location:partof`. HAPI walks the partof chain
// recursively, so one round trip replaces the old fan-out (1 call per ward).
// Filters client-side to FACILITY resources.
export async function getDescendantFacilities(rootId: string): Promise<Location[]> {
  const url = `${FHIR_BASE_URL}/Location?_id=${encodeURIComponent(
    rootId,
  )}&_revinclude:iterate=Location:partof&_count=5000`;
  const response = await fhirFetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to load descendants (${response.status})`);
  }
  const bundle = (await response.json()) as LocationBundle;
  const out: Location[] = [];
  for (const entry of bundle.entry ?? []) {
    const r = entry.resource;
    if (!r) continue;
    if (r.type?.[0]?.coding?.[0]?.code !== 'FACILITY') continue;
    out.push({
      id: r.id || '',
      name: r.name || '',
      type: r.type?.[0]?.coding?.[0]?.display,
      typeCode: r.type?.[0]?.coding?.[0]?.code,
      status: r.status || 'active',
      description: r.description,
      parentId: r.partOf?.reference?.replace('Location/', ''),
      parentName: r.partOf?.display,
      position: r.position,
    });
  }
  return out;
}

// FHIR API functions
export const fhirApi = {
  // Get all counties from FHIR server
  getCounties: async (): Promise<FhirCounty[]> => {
    try {
      const response = await fhirFetch(`${FHIR_BASE_URL}/Location?type:code=COUNTY&_count=100`, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bundle: FhirBundle = await response.json();
      
      if (!bundle.entry) {
        return [];
      }

      // Map FHIR Location resources to our County interface
      const counties: FhirCounty[] = bundle.entry
        .filter(entry => entry.resource && entry.resource.name)
        .map(entry => ({
          id: entry.resource!.id,
          name: entry.resource!.name!,
          code: entry.resource!.type?.[0]?.coding?.[0]?.code
        }))
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

      return counties;
    } catch (error) {
      console.error('Error fetching counties from FHIR:', error);
      throw error;
    }
  },

  // Get sub-counties for a specific county
  getSubCounties: async (countyId: string): Promise<FhirSubCounty[]> => {
    try {
      const response = await fhirFetch(`${FHIR_BASE_URL}/Location?partof=Location/${countyId}&_count=100`, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bundle: FhirBundle = await response.json();
      
      if (!bundle.entry) {
        return [];
      }

      // Map FHIR Location resources to our SubCounty interface
      const subCounties: FhirSubCounty[] = bundle.entry
        .filter(entry => entry.resource && entry.resource.name)
        .map(entry => ({
          id: entry.resource!.id,
          name: entry.resource!.name!,
          countyId: countyId,
          countyName: entry.resource!.partOf?.display
        }))
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

      return subCounties;
    } catch (error) {
      console.error('Error fetching sub-counties from FHIR:', error);
      throw error;
    }
  },

  // Get wards for a specific sub-county
  getWards: async (subCountyId: string): Promise<FhirWard[]> => {
    try {
      const response = await fhirFetch(`${FHIR_BASE_URL}/Location?partof=Location/${subCountyId}&_count=100`, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bundle: FhirBundle = await response.json();
      
      if (!bundle.entry) {
        return [];
      }

      // Map FHIR Location resources to our Ward interface
      const wards: FhirWard[] = bundle.entry
        .filter(entry => entry.resource && entry.resource.name)
        .map(entry => ({
          id: entry.resource!.id,
          name: entry.resource!.name!,
          subCountyId: subCountyId,
          subCountyName: entry.resource!.partOf?.display
        }))
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

      return wards;
    } catch (error) {
      console.error('Error fetching wards from FHIR:', error);
      throw error;
    }
  },

  // Get facilities for a specific ward
  getFacilities: async (wardId: string): Promise<FhirFacility[]> => {
    try {
      const response = await fhirFetch(`${FHIR_BASE_URL}/Location?partof=Location/${wardId}&_count=100`, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bundle: FhirBundle = await response.json();
      
      if (!bundle.entry) {
        return [];
      }

      // Map FHIR Location resources to our Facility interface
      const facilities: FhirFacility[] = bundle.entry
        .filter(entry => entry.resource && entry.resource.name)
        .map(entry => ({
          id: entry.resource!.id,
          name: entry.resource!.name!,
          wardId: wardId,
          wardName: entry.resource!.partOf?.display
        }))
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

      return facilities;
    } catch (error) {
      console.error('Error fetching facilities from FHIR:', error);
      throw error;
    }
  },

  // Get all locations (for future use)
  getLocations: async (typeCode?: string): Promise<FhirLocation[]> => {
    try {
      const url = typeCode 
        ? `${FHIR_BASE_URL}/Location?type:code=${typeCode}&_count=100`
        : `${FHIR_BASE_URL}/Location?_count=100`;
        
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bundle: FhirBundle = await response.json();
      
      if (!bundle.entry) {
        return [];
      }

      return bundle.entry
        .filter(entry => entry.resource)
        .map(entry => entry.resource!);
    } catch (error) {
      console.error('Error fetching locations from FHIR:', error);
      throw error;
    }
  }
};

// Import location types
import { 
  FhirLocation as FhirLocationResource, 
  FhirBundle as LocationBundle, 
  Location, 
  CreateLocationRequest,
  PaginatedLocationResponse
} from '@/types/location';

// Location Management API functions
export const locationApi = {
  // Get all locations with pagination, filtering, and search
  getLocations: async (
    page: number = 1,
    count: number = 10,
    typeCode?: string,
    nameSearch?: string,
    parentId?: string
  ): Promise<PaginatedLocationResponse> => {
    try {
      // Build URL with server-side filtering and pagination
      let url = `${FHIR_BASE_URL}/Location?_count=${count}`;
      
      // Add page offset (FHIR uses _offset for pagination)
      if (page > 1) {
        const offset = (page - 1) * count;
        url += `&_offset=${offset}`;
      }
      
      // Add type filter using type:code
      if (typeCode) {
        url += `&type:code=${typeCode}`;
      }
      
      // Add name search using name:contains (supports partial matching)
      if (nameSearch && nameSearch.trim()) {
        url += `&name:contains=${encodeURIComponent(nameSearch.trim())}`;
      }
      
      // Add parent filter
      if (parentId) {
        url += `&partof=Location/${parentId}`;
      }
      
      console.log('Fetching locations from:', url); // Debug log

      const response = await fhirFetch(url, { method: 'GET' });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('FHIR API Error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bundle: LocationBundle = await response.json();
      
      // The server returns the total count in bundle.total
      const total = bundle.total || 0;
      const locations: Location[] = [];

      if (bundle.entry) {
        // Map FHIR Location resources to our simplified Location interface
        bundle.entry
          .filter(entry => entry.resource)
          .forEach(entry => {
            const resource = entry.resource!;
            locations.push({
              id: resource.id || '',
              name: resource.name || '',
              type: resource.type?.[0]?.coding?.[0]?.display,
              typeCode: resource.type?.[0]?.coding?.[0]?.code,
              status: resource.status || 'active',
              description: resource.description,
              parentId: resource.partOf?.reference?.replace('Location/', ''),
              parentName: resource.partOf?.display,
              address: resource.address?.text || 
                       [resource.address?.line?.join(', '), resource.address?.city, resource.address?.state]
                         .filter(Boolean).join(', '),
              phone: resource.telecom?.find(t => t.system === 'phone')?.value,
              email: resource.telecom?.find(t => t.system === 'email')?.value,
              position: resource.position,
            });
          });
      }

      // Check for next/previous links in the bundle
      const nextLink = bundle.link?.find(link => link.relation === 'next');
      const prevLink = bundle.link?.find(link => link.relation === 'previous');
      
      // Determine pagination state
      const hasNext = !!nextLink || ((page * count) < total);
      const hasPrevious = page > 1 || !!prevLink;

      return {
        locations,
        total,
        hasNext,
        hasPrevious,
        currentPage: page,
      };
    } catch (error) {
      console.error('Error fetching locations from FHIR:', error);
      throw error;
    }
  },

  // Get an accurate count of child locations using FHIR _summary=count
  getLocationChildrenCount: async (parentId: string): Promise<number> => {
    try {
      if (!parentId) {
        return 0;
      }

      const url = `${FHIR_BASE_URL}/Location?_summary=count&partof=Location/${parentId}`;
      console.log('Fetching child location count from:', url);

      const response = await fhirFetch(url, { method: 'GET' });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('FHIR child count API Error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bundle: LocationBundle = await response.json();
      return bundle.total || 0;
    } catch (error) {
      console.error('Error fetching child location count from FHIR:', error);
      throw error;
    }
  },

  // Get a single location by ID
  getLocationById: async (locationId: string): Promise<Location> => {
    try {
      const response = await fhirFetch(`${FHIR_BASE_URL}/Location/${locationId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const resource: FhirLocationResource = await response.json();
      
      return {
        id: resource.id || '',
        name: resource.name || '',
        type: resource.type?.[0]?.coding?.[0]?.display,
        typeCode: resource.type?.[0]?.coding?.[0]?.code,
        status: resource.status || 'active',
        description: resource.description,
        parentId: resource.partOf?.reference?.replace('Location/', ''),
        parentName: resource.partOf?.display,
        address: resource.address?.text || 
                 [resource.address?.line?.join(', '), resource.address?.city, resource.address?.state]
                   .filter(Boolean).join(', '),
        phone: resource.telecom?.find(t => t.system === 'phone')?.value,
        email: resource.telecom?.find(t => t.system === 'email')?.value,
        position: resource.position,
      };
    } catch (error) {
      console.error('Error fetching location from FHIR:', error);
      throw error;
    }
  },

  // Create a new location
  createLocation: async (locationData: CreateLocationRequest): Promise<Location> => {
    try {
      const fhirLocation: FhirLocationResource = {
        resourceType: 'Location',
        status: locationData.status || 'active',
        name: locationData.name,
        description: locationData.description,
        mode: 'instance',
      };

      // Add type if provided
      if (locationData.typeCode) {
        fhirLocation.type = [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            code: locationData.typeCode,
            display: locationData.type || locationData.typeCode,
          }],
        }];
      }

      // Add parent location reference if provided
      if (locationData.parentId) {
        fhirLocation.partOf = {
          reference: `Location/${locationData.parentId}`,
        };
      }

      // Add address if provided
      if (locationData.address) {
        fhirLocation.address = locationData.address;
      }

      // Add telecom (phone/email) if provided
      if (locationData.phone || locationData.email) {
        fhirLocation.telecom = [];
        
        if (locationData.phone) {
          fhirLocation.telecom.push({
            system: 'phone',
            value: locationData.phone,
            use: 'work',
          });
        }
        
        if (locationData.email) {
          fhirLocation.telecom.push({
            system: 'email',
            value: locationData.email,
            use: 'work',
          });
        }
      }

      // Add position if provided
      if (locationData.position) {
        fhirLocation.position = locationData.position;
      }

      const response = await fhirFetch(`${FHIR_BASE_URL}/Location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json',
          'Accept': 'application/fhir+json',
        },
        body: JSON.stringify(fhirLocation),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.issue?.[0]?.diagnostics || `HTTP error! status: ${response.status}`);
      }

      const createdResource: FhirLocationResource = await response.json();
      
      return {
        id: createdResource.id || '',
        name: createdResource.name || '',
        type: createdResource.type?.[0]?.coding?.[0]?.display,
        typeCode: createdResource.type?.[0]?.coding?.[0]?.code,
        status: createdResource.status || 'active',
        description: createdResource.description,
        parentId: createdResource.partOf?.reference?.replace('Location/', ''),
        parentName: createdResource.partOf?.display,
        address: createdResource.address?.text,
        phone: createdResource.telecom?.find(t => t.system === 'phone')?.value,
        email: createdResource.telecom?.find(t => t.system === 'email')?.value,
        position: createdResource.position,
      };
    } catch (error) {
      console.error('Error creating location:', error);
      throw error;
    }
  },

  // Update an existing location
  updateLocation: async (locationId: string, locationData: Partial<CreateLocationRequest>): Promise<Location> => {
    try {
      // First, get the existing location
      const existingResponse = await fhirFetch(`${FHIR_BASE_URL}/Location/${locationId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!existingResponse.ok) {
        throw new Error(`Failed to fetch existing location: ${existingResponse.status}`);
      }

      const existingLocation: FhirLocationResource = await existingResponse.json();

      // Update fields
      const updatedLocation: FhirLocationResource = {
        ...existingLocation,
        name: locationData.name ?? existingLocation.name,
        description: locationData.description ?? existingLocation.description,
        status: locationData.status ?? existingLocation.status,
      };

      // Update type if provided
      if (locationData.typeCode) {
        updatedLocation.type = [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            code: locationData.typeCode,
            display: locationData.type || locationData.typeCode,
          }],
        }];
      }

      // Update parent location if provided
      if (locationData.parentId !== undefined) {
        if (locationData.parentId) {
          updatedLocation.partOf = {
            reference: `Location/${locationData.parentId}`,
          };
        } else {
          delete updatedLocation.partOf;
        }
      }

      // Update address if provided
      if (locationData.address) {
        updatedLocation.address = locationData.address;
      }

      // Update telecom if provided
      if (locationData.phone !== undefined || locationData.email !== undefined) {
        updatedLocation.telecom = [];
        
        if (locationData.phone) {
          updatedLocation.telecom.push({
            system: 'phone',
            value: locationData.phone,
            use: 'work',
          });
        }
        
        if (locationData.email) {
          updatedLocation.telecom.push({
            system: 'email',
            value: locationData.email,
            use: 'work',
          });
        }
      }

      // Update position if provided
      if (locationData.position !== undefined) {
        updatedLocation.position = locationData.position;
      }

      const response = await fhirFetch(`${FHIR_BASE_URL}/Location/${locationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/fhir+json',
          'Accept': 'application/fhir+json',
        },
        body: JSON.stringify(updatedLocation),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.issue?.[0]?.diagnostics || `HTTP error! status: ${response.status}`);
      }

      const resource: FhirLocationResource = await response.json();
      
      return {
        id: resource.id || '',
        name: resource.name || '',
        type: resource.type?.[0]?.coding?.[0]?.display,
        typeCode: resource.type?.[0]?.coding?.[0]?.code,
        status: resource.status || 'active',
        description: resource.description,
        parentId: resource.partOf?.reference?.replace('Location/', ''),
        parentName: resource.partOf?.display,
        address: resource.address?.text,
        phone: resource.telecom?.find(t => t.system === 'phone')?.value,
        email: resource.telecom?.find(t => t.system === 'email')?.value,
        position: resource.position,
      };
    } catch (error) {
      console.error('Error updating location:', error);
      throw error;
    }
  },

  // Delete a location
  deleteLocation: async (locationId: string): Promise<void> => {
    try {
      const response = await fhirFetch(`${FHIR_BASE_URL}/Location/${locationId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/fhir+json',
        }
      });

      if (!response.ok && response.status !== 204) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.issue?.[0]?.diagnostics || `HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error deleting location:', error);
      throw error;
    }
  },
};

export const callbackLogsApi = {
  getLogs: async (
    accessToken: string,
    params: {
      page?: number;
      limit?: number;
      outcome?: string;
      route?: string;
      resourceType?: string;
      search?: string;
    } = {},
  ): Promise<CallbackLogsApiResponse> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.outcome) qs.set('outcome', params.outcome);
    if (params.route) qs.set('route', params.route);
    if (params.resourceType) qs.set('resourceType', params.resourceType);
    const s = params.search?.trim();
    if (s) qs.set('search', s);
    const suffix = qs.toString();
    const url = `/api/subscriptions/callback-logs${suffix ? `?${suffix}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: 'frontend_lang=en_US',
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(
        (data as any).error ??
          (data as any).issue?.[0]?.diagnostics ??
          `HTTP error! status: ${response.status}`,
      );
      (err as any).response = { data, status: response.status };
      throw err;
    }
    return data as CallbackLogsApiResponse;
  },
};

export const epidRetryApi = {
  listMissing: async (
    accessToken: string,
    params: { limit?: number; cursor?: string | null } = {},
  ): Promise<MissingEpidEncountersResponse> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    const suffix = qs.toString();
    const url = `/api/subscriptions/encounters/missing-epid${suffix ? `?${suffix}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: 'frontend_lang=en_US',
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(
        (data as any).error ??
          (data as any).issue?.[0]?.diagnostics ??
          `HTTP error! status: ${response.status}`,
      );
      (err as any).response = { data, status: response.status };
      throw err;
    }
    return data as MissingEpidEncountersResponse;
  },

  retry: async (
    accessToken: string,
    encounterIds: string[],
  ): Promise<EpidRetryBatchResponse> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    const body =
      encounterIds.length === 1
        ? { encounterId: encounterIds[0] }
        : { encounterIds };

    const response = await fetch('/api/subscriptions/encounters/retry-epid', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Cookie: 'frontend_lang=en_US',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(
        (data as any).error ??
          (data as any).issue?.[0]?.diagnostics ??
          `HTTP error! status: ${response.status}`,
      );
      (err as any).response = { data, status: response.status };
      throw err;
    }

    if (Array.isArray((data as EpidRetryBatchResponse).results)) {
      return data as EpidRetryBatchResponse;
    }

    return {
      results: [{ encounterId: encounterIds[0], ok: true }],
    };
  },
};

export const notificationLogsApi = {
  getLogs: async (
    accessToken: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      type?: string;
      search?: string;
    } = {},
  ): Promise<NotificationLogsApiResponse> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.status) qs.set('status', params.status);
    if (params.type) qs.set('type', params.type);
    const s = params.search?.trim();
    if (s) qs.set('search', s);
    const suffix = qs.toString();
    const url = `/api/subscriptions/notification-logs${suffix ? `?${suffix}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: 'frontend_lang=en_US',
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(
        (data as any).error ??
          (data as any).issue?.[0]?.diagnostics ??
          `HTTP error! status: ${response.status}`,
      );
      (err as any).response = { data, status: response.status };
      throw err;
    }
    return data as NotificationLogsApiResponse;
  },
};
