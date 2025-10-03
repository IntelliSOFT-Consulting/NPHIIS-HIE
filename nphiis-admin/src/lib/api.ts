import { User, CreateUserRequest } from '@/types/user';

// API host configuration
const API_HOST = process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:3000';

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
