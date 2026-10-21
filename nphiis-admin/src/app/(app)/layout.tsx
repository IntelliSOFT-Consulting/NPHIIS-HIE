'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { isCallCentreOnly } from '@/lib/roles';
import AppShell from '@/components/AppShell';
import Spinner from '@/components/ui/Spinner';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, roles } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  // Call-centre agents may only open the Call Centre module.
  const wrongPage =
    isCallCentreOnly(roles) && !(pathname === '/call-centre' || pathname.startsWith('/call-centre/'));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    } else if (!isLoading && wrongPage) {
      router.replace('/call-centre');
    }
  }, [isAuthenticated, isLoading, wrongPage, router]);

  if (isLoading || !isAuthenticated || wrongPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Spinner size="lg" label="Loading…" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
