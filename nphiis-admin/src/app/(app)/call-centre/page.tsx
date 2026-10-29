'use client';

import CallCentreView from '@/components/call-centre/CallCentreView';
import { useAuth } from '@/lib/auth-context';
import { Alert } from '@/components/ui/Alert';

export default function CallCentrePage() {
  const { can } = useAuth();
  if (!can('CALL_CENTRE')) return <Alert variant="error">You do not have access to the Alert Log.</Alert>;
  return <CallCentreView />;
}
