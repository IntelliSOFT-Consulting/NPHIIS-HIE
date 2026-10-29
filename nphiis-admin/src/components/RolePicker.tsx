'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/api';
import { LEVEL_ROLE, formatRole } from '@/lib/roles';
import { Select } from './ui/Field';

export interface ProfileOption {
  slug: string;
  name: string;
  level: keyof typeof LEVEL_ROLE;
}

/** Profiles created on the Roles page (empty when they cannot be loaded). */
export function useProfiles(): ProfileOption[] {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    fetch('/api/provider/profiles', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { profiles: [] }))
      .then((b) => setProfiles(b.profiles ?? []))
      .catch(() => setProfiles([]));
  }, []);
  return profiles;
}

/**
 * One list for the built-in roles and the profiles. A profile is saved as the existing role of
 * its level (so locations and the mobile app behave as before) plus its slug.
 */
export default function RolePicker({
  roles,
  role,
  profileSlug,
  onChange,
  disabled,
  id = 'role',
  loadingLabel,
}: {
  roles: string[];
  role: string;
  profileSlug: string;
  onChange: (role: string, profileSlug: string) => void;
  disabled?: boolean;
  id?: string;
  loadingLabel?: string;
}) {
  const profiles = useProfiles();
  const value = profileSlug && profiles.some((p) => p.slug === profileSlug) ? `profile:${profileSlug}` : `role:${role}`;
  const options = loadingLabel
    ? [{ value: `role:${role}`, label: loadingLabel === role ? formatRole(role) : loadingLabel }]
    : [
        ...profiles.map((p) => ({ value: `profile:${p.slug}`, label: `${p.name} · profile` })),
        ...roles.map((r) => ({ value: `role:${r}`, label: formatRole(r) })),
      ];
  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      searchable
      options={options}
      placeholder="Choose a role…"
      onChange={(v) => {
        const key = v.slice(v.indexOf(':') + 1);
        if (v.startsWith('profile:')) {
          const p = profiles.find((x) => x.slug === key);
          if (p) onChange(LEVEL_ROLE[p.level], p.slug);
        } else {
          onChange(key, '');
        }
      }}
    />
  );
}
