'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useAuthedFetch } from '@/lib/auth-context';
import { Alert } from './ui/Alert';
import { CheckboxGroup, Field, Select, TextInput } from './ui/Field';
import { TableSkeleton } from './ui/Skeleton';

type Level = 'NATIONAL' | 'COUNTY' | 'SUB_COUNTY' | 'FACILITY';
/** A role: a profile at a level. */
interface Role {
  slug?: string;
  role?: string;
  name: string;
  level: Level;
  /** "builtin:<KEY>" or "custom:<SLUG>" */
  profile: string;
  permissions: string[];
}
/** A permission profile: what a job function can do, at any level. */
interface PermProfile {
  key?: string;
  slug?: string;
  name: string;
  permissions: string[];
}
interface Catalogue {
  levels: Level[];
  permissions: { key: string; label: string }[];
  builtIn: Role[];
  profiles: Role[];
  permissionProfiles: { builtIn: PermProfile[]; custom: PermProfile[] };
}

export const LEVEL_LABEL: Record<Level, string> = {
  NATIONAL: 'National',
  COUNTY: 'County',
  SUB_COUNTY: 'Sub-County',
  FACILITY: 'Facility',
};

const btnPrimary =
  'shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nphi-gradient text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-50';
const btnGhost = 'px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50';

/** Roles & Permissions: profiles (sets of permissions) and roles (a profile at a level). */
export default function RolesPermissionsView() {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'roles' | 'profiles'>('roles');
  const [editRole, setEditRole] = useState<Role | { profile?: string } | null>(null);
  const [editProfile, setEditProfile] = useState<PermProfile | 'new' | null>(null);

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

  const permLabel = (key: string) => data?.permissions.find((p) => p.key === key)?.label ?? key;
  const profileName = (ref: string) => {
    const [kind, key] = [ref.split(':')[0], ref.slice(ref.indexOf(':') + 1)];
    const list = kind === 'builtin' ? data?.permissionProfiles.builtIn : data?.permissionProfiles.custom;
    return list?.find((p) => (p.key ?? p.slug)?.toUpperCase() === key.toUpperCase())?.name ?? key;
  };

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="flex items-center gap-3 border-b border-gray-200">
        {(['roles', 'profiles'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px px-3 py-2 text-sm font-medium border-b-2 ${
              tab === t ? 'border-nphi-600 text-nphi-800' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'roles' ? 'Roles' : 'Profiles'}
          </button>
        ))}
        <div className="ml-auto pb-1.5">
          {tab === 'roles' ? (
            <button type="button" className={btnPrimary} onClick={() => { setNotice(null); setEditRole({}); }}>
              <PlusIcon className="h-4 w-4" /> New role
            </button>
          ) : (
            <button type="button" className={btnPrimary} onClick={() => { setNotice(null); setEditProfile('new'); }}>
              <PlusIcon className="h-4 w-4" /> New profile
            </button>
          )}
        </div>
      </div>

      {!data ? (
        <TableSkeleton rows={5} cols={4} />
      ) : tab === 'roles' ? (
        <>
          <Table
            title="Your roles"
            empty="No roles yet. Create a profile, then a role that uses it at a level."
            rows={data.profiles.map((r) => ({
              id: r.slug!,
              name: r.name,
              chip: LEVEL_LABEL[r.level],
              sub: profileName(r.profile),
              items: r.permissions.map(permLabel),
              onClick: () => setEditRole(r),
            }))}
          />
          <Table
            title="Built-in roles (read-only)"
            rows={data.builtIn.map((r) => ({
              id: r.role!,
              name: r.name,
              chip: LEVEL_LABEL[r.level],
              sub: profileName(r.profile),
              items: r.permissions.map(permLabel),
            }))}
          />
        </>
      ) : (
        <>
          <Table
            title="Your profiles"
            empty="No profiles yet. A profile is a set of permissions, for example Epi Logistician."
            rows={data.permissionProfiles.custom.map((p) => ({
              id: p.slug!,
              name: p.name,
              items: p.permissions.map(permLabel),
              onClick: () => setEditProfile(p),
            }))}
          />
          <Table
            title="Built-in profiles (read-only)"
            rows={data.permissionProfiles.builtIn.map((p) => ({ id: p.key!, name: p.name, items: p.permissions.map(permLabel) }))}
          />
        </>
      )}

      {editProfile && data && (
        <ProfileModal
          profile={editProfile === 'new' ? null : editProfile}
          catalogue={data}
          onClose={() => setEditProfile(null)}
          onDone={(message, created) => {
            setEditProfile(null);
            setNotice(message);
            load();
            // A new profile is usually made to be used: go straight to a role that uses it.
            if (created) {
              setTab('roles');
              setEditRole({ profile: `custom:${created}` });
            }
          }}
        />
      )}
      {editRole && data && (
        <RoleModal
          role={'slug' in editRole ? (editRole as Role) : null}
          presetProfile={'slug' in editRole ? undefined : editRole.profile}
          catalogue={data}
          onClose={() => setEditRole(null)}
          onDone={(message) => {
            setEditRole(null);
            setNotice(message);
            load();
          }}
        />
      )}
    </div>
  );
}

interface Row {
  id: string;
  name: string;
  chip?: string;
  sub?: string;
  items: string[];
  onClick?: () => void;
}

function Table({ title, rows, empty }: { title: string; rows: Row[]; empty?: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50/80">{title}</div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">{empty}</p>
      ) : (
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-nphi-100">
            {rows.map((r) => (
              <tr key={r.id} onClick={r.onClick} className={`align-top ${r.onClick ? 'cursor-pointer hover:bg-nphi-50/40' : ''}`}>
                <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
                {r.chip !== undefined && (
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="chip bg-gray-100 text-gray-700">{r.chip}</span>
                  </td>
                )}
                {r.sub !== undefined && <td className="px-2 py-2 whitespace-nowrap text-gray-600">{r.sub}</td>}
                <td className="px-4 py-2">
                  {r.items.length ? (
                    <div className="flex flex-wrap gap-1">
                      {r.items.map((k) => (
                        <span key={k} className="chip bg-nphi-50 text-nphi-800">{k}</span>
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

function Modal({ title, onClose, saving, footer, children }: { title: string; onClose: () => void; saving: boolean; footer: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);
  return (
    <div
      className="fixed inset-0 bg-gray-900/75 overflow-y-auto z-50 flex items-start justify-center p-4 sm:py-10"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-nphi-100 px-5 py-3">
          <h2 className="text-base font-semibold text-nphi-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
        <div className="flex items-center gap-3 border-t border-nphi-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

function Errors({ errors }: { errors: string[] }) {
  return errors.length ? (
    <Alert variant="error">
      <ul className="list-disc pl-5">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
    </Alert>
  ) : null;
}

/** Create, edit or delete a permission profile. */
function ProfileModal({
  profile,
  catalogue,
  onClose,
  onDone,
}: {
  profile: PermProfile | null;
  catalogue: Catalogue;
  onClose: () => void;
  onDone: (message: string, createdSlug?: string) => void;
}) {
  const authedFetch = useAuthedFetch();
  const [name, setName] = useState(profile?.name ?? '');
  const [permissions, setPermissions] = useState<string[]>(profile?.permissions ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function call(method: 'POST' | 'PUT' | 'DELETE') {
    setSaving(true);
    setErrors([]);
    try {
      const res = await authedFetch(profile ? `/api/provider/permission-profiles/${profile.slug}` : '/api/provider/permission-profiles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify({ name: name.trim(), permissions }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.errors ?? [body.error ?? `Request failed (${res.status}).`]);
        return;
      }
      if (method === 'DELETE') onDone(`Deleted ${profile!.name}.`);
      else if (method === 'PUT') onDone(`Saved ${profile!.name}.`);
      else onDone(`Created ${name.trim()}. Now create a role that uses it.`, body.profile?.slug);
    } catch (e) {
      setErrors([(e as Error).message || 'Request failed.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={profile ? `Edit ${profile.name}` : 'New profile'}
      onClose={onClose}
      saving={saving}
      footer={
        confirmDelete ? (
          <>
            <span className="text-sm text-gray-700 mr-auto">Delete this profile? No role may use it.</span>
            <button type="button" disabled={saving} onClick={() => call('DELETE')} className="px-3 py-1.5 rounded-lg bg-accent-700 text-sm font-medium text-white disabled:opacity-50">Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={btnGhost}>Keep</button>
          </>
        ) : (
          <>
            {profile && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto text-sm text-accent-700 hover:underline">Delete profile</button>
            )}
            <button type="button" onClick={onClose} className={`${profile ? '' : 'ml-auto'} ${btnGhost}`}>Cancel</button>
            <button type="button" disabled={saving || !name.trim()} onClick={() => call(profile ? 'PUT' : 'POST')} className={btnPrimary}>
              {saving ? 'Saving…' : profile ? 'Save' : 'Create'}
            </button>
          </>
        )
      }
    >
      <Errors errors={errors} />
      <Field label="Profile name" required hint={profile ? 'The name cannot be changed once created.' : 'For example Epi Logistician'}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={!!profile} />
      </Field>
      <Field label={`Permissions (${permissions.length} selected)`} hint={profile ? 'Every role that uses this profile follows the change.' : undefined}>
        <CheckboxGroup name="permissions" values={permissions} options={catalogue.permissions.map((p) => ({ value: p.key, label: p.label }))} onChange={setPermissions} />
      </Field>
    </Modal>
  );
}

/** Create, edit or delete a role: a profile at a level. Deleting a role in use moves its users first. */
function RoleModal({
  role,
  presetProfile,
  catalogue,
  onClose,
  onDone,
}: {
  role: Role | null;
  presetProfile?: string;
  catalogue: Catalogue;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const authedFetch = useAuthedFetch();
  const [name, setName] = useState(role?.name ?? '');
  const [level, setLevel] = useState<Level>(role?.level ?? 'COUNTY');
  const [profile, setProfile] = useState(role?.profile ?? presetProfile ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // Users still hold the role: the server asks for the role they move to.
  const [moveUsers, setMoveUsers] = useState<number | null>(null);
  const [target, setTarget] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const profileOptions = [
    ...catalogue.permissionProfiles.custom.map((p) => ({ value: `custom:${p.slug}`, label: `${p.name} (your profile)` })),
    ...catalogue.permissionProfiles.builtIn.map((p) => ({ value: `builtin:${p.key}`, label: p.name })),
  ];

  /** Roles at this role's level that its users can move to. */
  const targets = [
    ...catalogue.profiles.filter((p) => p.level === role?.level && p.slug !== role?.slug).map((p) => ({ value: `profile:${p.slug}`, label: `${p.name} (role)` })),
    ...catalogue.builtIn.filter((b) => b.level === role?.level).map((b) => ({ value: `role:${b.role}`, label: `${b.name} (built-in role)` })),
  ];

  async function save() {
    setSaving(true);
    setErrors([]);
    try {
      const res = await authedFetch(role ? `/api/provider/profiles/${role.slug}` : '/api/provider/profiles', {
        method: role ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), level, profile }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.errors ?? [body.error ?? `Request failed (${res.status}).`]);
        return;
      }
      onDone(role ? `Saved ${role.name}.` : `Created ${name.trim()}.`);
    } catch (e) {
      setErrors([(e as Error).message || 'Request failed.']);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!role) return;
    setSaving(true);
    setErrors([]);
    try {
      const qs = target ? `?migrateTo=${encodeURIComponent(target)}` : '';
      const res = await authedFetch(`/api/provider/profiles/${role.slug}${qs}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.requiresTarget) {
        setMoveUsers(body.users);
        return;
      }
      if (!res.ok) {
        setErrors(body.errors ?? [body.error ?? `Request failed (${res.status}).`]);
        return;
      }
      if (res.status !== 202) {
        onDone(`Deleted ${role.name}.`);
        return;
      }
      // The users move in the background; poll until it finishes.
      const job = body.job as { id: string; total: number };
      setProgress({ done: 0, total: job.total });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const poll = await authedFetch(`/api/provider/profiles/jobs/${job.id}`);
        const data = (await poll.json().catch(() => ({}))).job;
        if (!poll.ok || !data) {
          setErrors(['Lost track of the move. Check the Users list, then retry the delete.']);
          return;
        }
        setProgress({ done: data.done, total: data.total });
        if (data.state === 'done') {
          onDone(`Deleted ${role.name}; ${data.total} user(s) moved to ${targets.find((t) => t.value === target)?.label ?? 'the new role'}.`);
          return;
        }
        if (data.state === 'failed') {
          setErrors([data.error ?? 'Some users could not be moved; the role was kept.']);
          return;
        }
      }
    } catch (e) {
      setErrors([(e as Error).message || 'Request failed.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={role ? `Edit ${role.name}` : 'New role'}
      onClose={onClose}
      saving={saving}
      footer={
        confirmDelete && role ? (
          <div className="flex flex-wrap items-center gap-3 w-full">
            {moveUsers != null ? (
              <div className="w-full space-y-2">
                <p className="text-sm text-gray-700">
                  {moveUsers} user(s) have this role. Choose the new role they move to; it must be at the same level ({LEVEL_LABEL[role.level]}).
                </p>
                <Select value={target} onChange={setTarget} options={[{ value: '', label: 'Choose a new role…' }, ...targets]} />
                {progress && <p className="text-sm text-nphi-800">Moving users… {progress.done} of {progress.total}</p>}
              </div>
            ) : (
              <span className="text-sm text-gray-700 mr-auto">Delete this role?</span>
            )}
            <button type="button" disabled={saving || (moveUsers != null && !target)} onClick={remove} className="px-3 py-1.5 rounded-lg bg-accent-700 text-sm font-medium text-white disabled:opacity-50">
              {moveUsers != null ? 'Move users and delete' : 'Delete'}
            </button>
            <button type="button" disabled={saving} onClick={() => { setConfirmDelete(false); setMoveUsers(null); setTarget(''); }} className={btnGhost}>Keep</button>
          </div>
        ) : (
          <>
            {role && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto text-sm text-accent-700 hover:underline">Delete role</button>
            )}
            <button type="button" onClick={onClose} className={`${role ? '' : 'ml-auto'} ${btnGhost}`}>Cancel</button>
            <button type="button" disabled={saving || !name.trim() || !profile} onClick={save} className={btnPrimary}>
              {saving ? 'Saving…' : role ? 'Save' : 'Create'}
            </button>
          </>
        )
      }
    >
      <Errors errors={errors} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role name" required hint={role ? 'The name cannot be changed once created.' : 'For example County Epi Logistician'}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={!!role} />
        </Field>
        <Field label="Level" required hint="How much of the country the user sees, with their location.">
          <Select value={level} onChange={(v) => setLevel(v as Level)} options={catalogue.levels.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} />
        </Field>
      </div>
      <Field label="Profile" required hint="The permissions this role inherits.">
        <Select value={profile} onChange={setProfile} options={profileOptions} placeholder="Choose a profile…" />
      </Field>
    </Modal>
  );
}
