import { User, CreateUserRequest } from '@/types/user';

// API host configuration
const API_HOST = process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:3000';
const FHIR_BASE_URL = process.env.NEXT_PUBLIC_FHIR_BASE_URL || 'https://dsrfhir.intellisoftkenya.com/hapi/fhir';

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
}

interface UserInfoResponse {
  status: 'success' | 'error';
  user?: UserInfo;
  error?: string;
}

interface UsersApiResponse {
  users: User[];
  status: 'success' | 'error';
  error?: string;
}


// User management API functions
export const userApi = {
  // Get all users from real API
  getUsers: async (accessToken?: string): Promise<User[]> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }
    
    try {
      const response = await fetch(`${API_HOST}/provider/users`, {
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
        return data.users;
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
      const response = await fetch(`${API_HOST}/provider/user/${userId}`, {
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
        return {
          id: data.user.id,
          username: data.user.idNumber,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phone: data.user.phone,
          locationId: data.user.locationInfo?.facility || '',
          role: data.user.role || data.user.practitionerRole,
          enabled: true, // Default to enabled since API doesn't provide this
          createdTimestamp: Date.now(), // Default timestamp
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
      const response = await fetch(`${API_HOST}/provider/register`, {
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
      return {
        id: data.id || Date.now().toString(),
        username: userData.idNumber, // Map idNumber to username for display
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        role: userData.role,
        enabled: true,
        createdTimestamp: Date.now(),
      };
    } catch (error) {
      console.error('Create user error:', error);
      throw error;
    }
  },

  // Update user using real API
  updateUser: async (userId: string, userData: Partial<User>, accessToken?: string): Promise<User> => {
    if (!accessToken) {
      throw new Error('Access token required');
    }

    try {
      // Map form data to API format
      const apiPayload: any = {};
      
      // Map the form data fields to API format
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
      
      // Use the PUT /users/{username} endpoint with userId as username
      const response = await fetch(`${API_HOST}/provider/users/${userId}`, {
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
        return {
          id: data.user.id,
          username: data.user.idNumber,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phone: data.user.phone,
          locationId: data.user.locationInfo?.facility || '',
          role: data.user.role || data.user.practitionerRole,
          enabled: true, // Default to enabled since API doesn't provide this
          createdTimestamp: Date.now() // Default timestamp
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

  // Delete user - Note: This endpoint doesn't exist in provider-auth.ts
  // Keeping the function but throwing an error to indicate it's not implemented
  deleteUser: async (userId: string, accessToken?: string): Promise<void> => {
    throw new Error('Delete user functionality is not available in the current API');
  },

  // Reset user password using real API
  resetPassword: async (userId: string, newPassword: string, resetCode: string): Promise<void> => {
    try {
      const response = await fetch(`${API_HOST}/provider/reset-password`, {
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

  // Enable/disable user - Note: This functionality is not directly available in provider-auth.ts
  // The API doesn't have a specific endpoint for toggling user status
  // This would need to be implemented in the backend or handled differently
  toggleUserStatus: async (userId: string, enabled: boolean, accessToken?: string): Promise<User> => {
    throw new Error('Toggle user status functionality is not available in the current API');
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
      const response = await fetch(`${API_HOST}/provider/login`, {
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
        const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
        (error as any).response = { data: errorData, status: response.status };
        throw error;
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
      const response = await fetch(`${API_HOST}/provider/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': 'frontend_lang=en_US'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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

      // Check if user role is ADMINISTRATOR
      if (userInfoResponse.user.role === 'ADMINISTRATOR') {
        return {
          success: true,
          userInfo: userInfoResponse.user,
          accessToken: loginResponse.access_token
        };
      } else {
        return {
          success: false,
          error: 'Access denied. Administrator role required.'
        };
      }
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

// FHIR API functions
export const fhirApi = {
  // Get all counties from FHIR server
  getCounties: async (): Promise<FhirCounty[]> => {
    try {
      const response = await fetch(`${FHIR_BASE_URL}/Location?type:code=COUNTY&_count=100`, {
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
      const response = await fetch(`${FHIR_BASE_URL}/Location?partof=Location/${countyId}&_count=100`, {
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
      const response = await fetch(`${FHIR_BASE_URL}/Location?partof=Location/${subCountyId}&_count=100`, {
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
      const response = await fetch(`${FHIR_BASE_URL}/Location?partof=Location/${wardId}&_count=100`, {
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
