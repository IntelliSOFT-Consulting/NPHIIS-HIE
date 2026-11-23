'use client';

import EvdSnapshotView from '@/components/outbreak-response/EvdSnapshotView';
import { useAuth } from '@/lib/auth-context';
import { Alert } from '@/components/ui/Alert';

export default function EvdSnapshotPage() {
  const { can } = useAuth();
  if (!can('EVD_SNAPSHOT')) {
    return <Alert variant="error">You do not have access to the EVD Daily Snapshot.</Alert>;
  }
  return <EvdSnapshotView />;
}
