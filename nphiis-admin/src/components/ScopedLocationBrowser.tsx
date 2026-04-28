'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRightIcon,
  MapPinIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import { locationApi } from '@/lib/api';
import type { Location } from '@/types/location';
import Spinner from './ui/Spinner';

interface Crumb {
  id: string;
  name: string;
  typeCode?: string;
}

interface ScopedLocationBrowserProps {
  // The id the tree is rooted at. User cannot navigate above this.
  rootId: string;
  rootName: string;
  rootTypeCode?: 'COUNTY' | 'SUB-COUNTY' | 'WARD' | string;
}

// Read-only drill-down browser for users whose view is restricted to a scope.
// Starts at `rootId`, lets them click into children down to facilities, and
// never shows a breadcrumb above the root.
export default function ScopedLocationBrowser({
  rootId,
  rootName,
  rootTypeCode,
}: ScopedLocationBrowserProps) {
  const [path, setPath] = useState<Crumb[]>([
    { id: rootId, name: rootName, typeCode: rootTypeCode },
  ]);
  const [children, setChildren] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const current = path[path.length - 1];

  useEffect(() => {
    // Re-seed when scope root changes.
    setPath([{ id: rootId, name: rootName, typeCode: rootTypeCode }]);
    setPage(1);
  }, [rootId, rootName, rootTypeCode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await locationApi.getLocations(
        page,
        pageSize,
        undefined,
        undefined,
        current.id,
      );
      setChildren(res.locations);
      setTotal(res.total);
    } catch (e) {
      setError((e as Error).message);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [current.id, page]);

  useEffect(() => {
    load();
  }, [load]);

  const drill = (loc: Location) => {
    setPath([...path, { id: loc.id, name: loc.name, typeCode: loc.typeCode }]);
    setPage(1);
  };

  const jumpTo = (idx: number) => {
    setPath(path.slice(0, idx + 1));
    setPage(1);
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-nphi-100/60 flex items-center justify-between">
        <nav className="flex items-center text-sm text-gray-600 flex-wrap">
          {path.map((p, i) => {
            const isLast = i === path.length - 1;
            return (
              <span key={p.id} className="flex items-center">
                {i > 0 && <ChevronRightIcon className="h-4 w-4 mx-1 text-gray-400" />}
                {isLast ? (
                  <span className="font-semibold text-nphi-900">{p.name}</span>
                ) : (
                  <button
                    onClick={() => jumpTo(i)}
                    className="text-nphi-700 hover:text-nphi-800 hover:underline"
                  >
                    {p.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        {loading && <Spinner size="sm" />}
      </div>

      {error && (
        <div className="m-4 bg-accent-50 border border-accent-200 rounded-xl p-3 text-sm text-accent-700">
          {error}
        </div>
      )}

      <div className="divide-y divide-nphi-100/40">
        {loading && children.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Spinner size="md" label="Loading…" />
          </div>
        ) : children.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No child locations under {current.name}.
          </div>
        ) : (
          children.map((c) => {
            const isFacility = c.typeCode === 'FACILITY';
            const Icon = isFacility ? BuildingOffice2Icon : MapPinIcon;
            return (
              <div
                key={c.id}
                onClick={() => !isFacility && drill(c)}
                className={`flex items-center justify-between px-6 py-3 transition-colors ${
                  isFacility ? '' : 'cursor-pointer hover:bg-nphi-50/60'
                }`}
              >
                <div className="flex items-center min-w-0">
                  <div
                    className={`h-9 w-9 mr-3 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isFacility ? 'bg-accent-50 text-accent-600' : 'bg-nphi-50 text-nphi-700'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-nphi-900 truncate">
                      {c.name}
                    </div>
                    {c.type && <div className="text-xs text-gray-500">{c.type}</div>}
                  </div>
                </div>
                {!isFacility && (
                  <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                )}
              </div>
            );
          })
        )}
      </div>

      {total > pageSize && (
        <div className="px-6 py-3 border-t border-nphi-100/60 flex items-center justify-between text-xs text-gray-600">
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="space-x-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border border-nphi-100 rounded-lg text-nphi-800 hover:bg-nphi-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border border-nphi-100 rounded-lg text-nphi-800 hover:bg-nphi-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
