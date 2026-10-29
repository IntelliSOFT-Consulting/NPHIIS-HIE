'use client';

import RolesPermissionsView from '@/components/RolesPermissionsView';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/lib/auth-context';

export default function RolesPage() {
  const { can } = useAuth();
  if (!can('USERS_MANAGE')) return <Alert variant="error">You do not have access to Roles &amp; Permissions.</Alert>;
  return <RolesPermissionsView />;
}
