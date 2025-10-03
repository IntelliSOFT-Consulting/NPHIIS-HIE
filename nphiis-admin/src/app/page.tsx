'use client';

import { useState, useEffect } from 'react';
import AdminLogin from '@/components/AdminLogin';
import AdminDashboard from '@/components/AdminDashboard';
import { authApi } from '@/lib/api';

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in (from localStorage)
    // Only run on client side to prevent hydration mismatch
    if (typeof window !== 'undefined') {
      const savedAuth = localStorage.getItem('nphiis-admin-auth');
      if (savedAuth) {
        const authData = JSON.parse(savedAuth);
        setAuthenticated(true);
        setUserInfo(authData.userInfo);
      }
    }
    setIsLoading(false);
  }, []);

  const handleLogin = async (idNumber: string, password: string) => {
    try {
      // Use the real authentication API
      const result = await authApi.isAdministrator(idNumber, password);
      
      if (result.success && result.userInfo && result.accessToken) {
        const authData = {
          userInfo: {
            preferred_username: result.userInfo.idNumber,
            name: result.userInfo.fullNames,
            email: result.userInfo.email,
            firstName: result.userInfo.firstName,
            lastName: result.userInfo.lastName,
            role: result.userInfo.role,
            id: result.userInfo.id
          },
          accessToken: result.accessToken,
          timestamp: Date.now()
        };
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('nphiis-admin-auth', JSON.stringify(authData));
        }
        setAuthenticated(true);
        setUserInfo(authData.userInfo);
        return true;
      } else {
        console.error('Authentication failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nphiis-admin-auth');
    }
    setAuthenticated(false);
    setUserInfo(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return <AdminDashboard userInfo={userInfo} onLogout={handleLogout} />;
}
