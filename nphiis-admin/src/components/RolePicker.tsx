'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/api';
import { LEVEL_ROLE } from '@/lib/roles';

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
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const [kind, key] = [e.target.value.split(':')[0], e.target.value.slice(e.target.value.indexOf(':') + 1)];
        if (kind === 'profile') {
          const p = profiles.find((x) => x.slug === key);
          if (p) onChange(LEVEL_ROLE[p.level], p.slug);
        } else {
          onChange(key, '');
        }
      }}
      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 disabled:bg-gray-100"
    >
      {loadingLabel ? (
        <option value={`role:${role}`}>{loadingLabel}</option>
      ) : (
        <>
          {profiles.length > 0 && (
            <optgroup label="Profiles">
              {profiles.map((p) => (
                <option key={p.slug} value={`profile:${p.slug}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Roles">
            {roles.map((r) => (
              <option key={r} value={`role:${r}`}>
                {r}
              </option>
            ))}
          </optgroup>
        </>
      )}
    </select>
  );
}
