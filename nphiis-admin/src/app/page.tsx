'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLogin from '@/components/AdminLogin';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { homePath } from '@/lib/roles';

export default function Home() {
  const { isAuthenticated, isLoading, signIn, roles } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(homePath(roles));
    }
  }, [isAuthenticated, isLoading, roles, router]);

  const handleLogin = async (
    idNumber: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await authApi.isAdministrator(idNumber, password);
      if (!result.success || !result.userInfo || !result.accessToken) {
        console.error('Authentication failed:', result.error);
        return {
          success: false,
          error: result.error || 'Login failed',
        };
      }

      signIn({
        userInfo: {
          id: result.userInfo.id,
          username: result.userInfo.idNumber,
          preferred_username: result.userInfo.idNumber,
          name: result.userInfo.fullNames,
          email: result.userInfo.email,
          firstName: result.userInfo.firstName,
          lastName: result.userInfo.lastName,
          role: result.userInfo.role,
          fhirPractitionerId: result.userInfo.fhirPractitionerId,
          locationInfo: result.userInfo.locationInfo,
        },
        accessToken: result.accessToken,
        timestamp: Date.now(),
      });
      router.replace(homePath(result.userInfo.role ? [result.userInfo.role] : []));
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Authentication failed' };
    }
  };

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto rounded-full border-4 border-nphi-200 border-t-nphi-700 animate-spin" />
          <p className="mt-4 text-sm text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  return <AdminLogin onLogin={handleLogin} />;
}
