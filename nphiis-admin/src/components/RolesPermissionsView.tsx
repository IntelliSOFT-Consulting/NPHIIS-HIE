'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import { Alert } from './ui/Alert';
import { CheckboxGroup, Field, Select, TextInput } from './ui/Field';
import { TableSkeleton } from './ui/Skeleton';

type Level = 'NATIONAL' | 'COUNTY' | 'SUB_COUNTY' | 'FACILITY';
interface Profile {
  slug?: string;
  role?: string;
  name: string;
  level: Level;
  permissions: string[];
}
interface Catalogue {
  levels: Level[];
  permissions: { key: string; label: string }[];
  builtIn: Profile[];
  profiles: Profile[];
}

export const LEVEL_LABEL: Record<Level, string> = {
  NATIONAL: 'National',
  COUNTY: 'County',
  SUB_COUNTY: 'Sub-County',
  FACILITY: 'Facility',
};

/** Roles & Permissions: the four levels, the permission list, and the profiles built from them. */
export default function RolesPermissionsView() {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch('/api/provider/profiles');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body as Catalogue);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const label = (key: string) => data?.permissions.find((p) => p.key === key)?.label ?? key;

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-600 max-w-2xl">
          A user has one <strong>level</strong> (how much of the country they see, with their assigned location) and a{' '}
          <strong>profile</strong> (what they can do). Create a profile for each job title; the permissions you tick
          decide the screens and actions the user gets.
        </p>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setEditing('new');
          }}
          className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-nphi-gradient text-sm font-medium text-white shadow-sm hover:opacity-95"
        >
          <PlusIcon className="h-4 w-4" /> New profile
        </button>
      </div>

      {!data ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <>
          <ProfileTable
            title="Your profiles"
            empty="No profiles yet. Create one for each job title, for example County Epi Logistician."
            rows={data.profiles}
            label={label}
            onEdit={setEditing}
          />
          <ProfileTable title="Built-in roles (read-only)" rows={data.builtIn} label={label} />
        </>
      )}

      {editing && data && (
        <ProfileModal
          profile={editing === 'new' ? null : editing}
          catalogue={data}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            setNotice(message);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProfileTable({
  title,
  rows,
  empty,
  label,
  onEdit,
}: {
  title: string;
  rows: Profile[];
  empty?: string;
  label: (key: string) => string;
  onEdit?: (p: Profile) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50/80">{title}</div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">{empty}</p>
      ) : (
        <table className="min-w-full divide-y divide-nphi-100 text-sm">
          <tbody className="divide-y divide-nphi-100">
            {rows.map((p) => (
              <tr
                key={p.slug ?? p.role}
                onClick={onEdit ? () => onEdit(p) : undefined}
                className={`align-top ${onEdit ? 'cursor-pointer hover:bg-nphi-50/40' : ''}`}
              >
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.name}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="chip bg-gray-100 text-gray-700">{LEVEL_LABEL[p.level]}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {p.permissions.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {p.permissions.map((k) => (
                        <span key={k} className="chip bg-nphi-50 text-nphi-800">
                          {label(k)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">No permissions</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProfileModal({
  profile,
  catalogue,
  onClose,
  onDone,
}: {
  profile: Profile | null;
  catalogue: Catalogue;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const authedFetch = useAuthedFetch();
  const [name, setName] = useState(profile?.name ?? '');
  const [level, setLevel] = useState<Level>(profile?.level ?? 'COUNTY');
  const [permissions, setPermissions] = useState<string[]>(profile?.permissions ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function call(method: 'POST' | 'PUT' | 'DELETE', done: string) {
    setSaving(true);
    setErrors([]);
    try {
      const url = profile ? `/api/provider/profiles/${profile.slug}` : '/api/provider/profiles';
      const res = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify({ name: name.trim(), level, permissions }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.errors ?? [body.error ?? `Request failed (${res.status}).`]);
        return;
      }
      onDone(done);
    } catch (e) {
      setErrors([(e as Error).message || 'Request failed.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/75 overflow-y-auto z-50 flex items-start justify-center p-4 sm:py-10"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-nphi-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-nphi-900">{profile ? `Edit ${profile.name}` : 'New profile'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
            ✕
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {errors.length > 0 && (
            <Alert variant="error">
              <ul className="list-disc pl-5">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Profile name" required hint={profile ? 'The name cannot be changed once created.' : 'For example County Epi Logistician (CEPI)'}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={!!profile} />
            </Field>
            <Field label="Level" required hint="How much of the country the user sees, together with their assigned location.">
              <Select
                value={level}
                onChange={(v) => setLevel(v as Level)}
                options={catalogue.levels.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
              />
            </Field>
          </div>
          <Field label={`Permissions (${permissions.length} selected)`}>
            <CheckboxGroup
              name="permissions"
              values={permissions}
              options={catalogue.permissions.map((p) => ({ value: p.key, label: p.label }))}
              onChange={setPermissions}
            />
          </Field>
        </div>
        <div className="flex items-center gap-3 border-t border-nphi-100 px-5 py-3">
          {profile &&
            (confirmDelete ? (
              <>
                <span className="text-sm text-gray-700 mr-auto">Delete this profile? It must have no users.</span>
                <button type="button" disabled={saving} onClick={() => call('DELETE', `Deleted ${profile.name}.`)} className="px-3 py-2 rounded-lg bg-accent-700 text-sm font-medium text-white disabled:opacity-50">
                  Delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700">
                  Keep
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto text-sm text-accent-700 hover:underline">
                Delete profile
              </button>
            ))}
          {!confirmDelete && (
            <>
              <button type="button" onClick={onClose} className="ml-auto px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !name.trim()}
                onClick={() => call(profile ? 'PUT' : 'POST', profile ? `Saved ${profile.name}.` : `Created ${name.trim()}.`)}
                className="px-3.5 py-2 rounded-lg bg-nphi-gradient text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
