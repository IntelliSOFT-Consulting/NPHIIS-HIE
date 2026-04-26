"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ListBulletIcon, MapIcon } from "@heroicons/react/24/outline";
import LocationList from "./LocationList";
import ScopedLocationBrowser from "./ScopedLocationBrowser";
import Spinner from "./ui/Spinner";
import {
  fhirApi,
  getDescendantFacilities,
  locationApi,
  type FhirCounty,
  type FhirSubCounty,
  type FhirWard,
} from "@/lib/api";
import type { Location } from "@/types/location";
import { useAuth } from "@/lib/auth-context";
import { canAccess } from "@/lib/roles";

// react-leaflet uses window - load only on the client.
const LocationMap = dynamic(() => import("./LocationMap"), { ssr: false });

interface LocationsViewProps {
  onCreateLocation: () => void;
  refreshTrigger?: number;
}

type Mode = "list" | "map";

export default function LocationsView({
  onCreateLocation,
  refreshTrigger,
}: LocationsViewProps) {
  const [mode, setMode] = useState<Mode>("list");
  const { roles, locationInfo } = useAuth();

  // Users who can manage locations (admin/super) see the full tree. Scoped
  // users (county/sub-county) get a read-only drill-down rooted at their
  // assigned location so they can't browse outside it.
  const canManage = canAccess(roles, "LOCATIONS_MANAGE");
  const scope = !canManage
    ? locationInfo?.subCounty
      ? {
          id: locationInfo.subCounty,
          name: locationInfo.subCountyName || "Your sub-county",
          typeCode: "SUB-COUNTY" as const,
        }
      : locationInfo?.county
        ? {
            id: locationInfo.county,
            name: locationInfo.countyName || "Your county",
            typeCode: "COUNTY" as const,
          }
        : null
    : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div
          className="inline-flex p-1 bg-white rounded-xl border border-nphi-100 shadow-card"
          role="group"
        >
          <button
            onClick={() => setMode("list")}
            className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              mode === "list"
                ? "bg-nphi-gradient text-white"
                : "text-nphi-800 hover:bg-nphi-50"
            }`}
          >
            <ListBulletIcon className="h-4 w-4 mr-1.5" /> List
          </button>
          <button
            onClick={() => setMode("map")}
            className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              mode === "map"
                ? "bg-nphi-gradient text-white"
                : "text-nphi-800 hover:bg-nphi-50"
            }`}
          >
            <MapIcon className="h-4 w-4 mr-1.5" /> Map
          </button>
        </div>
      </div>

      {mode === "list" ? (
        scope ? (
          <ScopedLocationBrowser
            rootId={scope.id}
            rootName={scope.name}
            rootTypeCode={scope.typeCode}
          />
        ) : (
          <LocationList
            onCreateLocation={onCreateLocation}
            refreshTrigger={refreshTrigger}
          />
        )
      ) : (
        <FacilityMapPanel scopeLock={scope} />
      )}
    </div>
  );
}

interface ScopeLock {
  id: string;
  name: string;
  typeCode: "COUNTY" | "SUB-COUNTY" | "WARD";
}

function FacilityMapPanel({ scopeLock }: { scopeLock?: ScopeLock | null }) {
  const { locationInfo } = useAuth();
  const [counties, setCounties] = useState<FhirCounty[]>([]);
  const [subCounties, setSubCounties] = useState<FhirSubCounty[]>([]);
  const [wards, setWards] = useState<FhirWard[]>([]);
  // When the user's view is locked to a scope, seed the selectors with it.
  // The county lock comes from locationInfo.county; sub-county lock from
  // locationInfo.subCounty.
  const lockedCountyId = scopeLock ? (locationInfo?.county ?? "") : "";
  const lockedSubCountyId =
    scopeLock?.typeCode === "SUB-COUNTY" ? scopeLock.id : "";
  const [countyId, setCountyId] = useState(
    lockedCountyId || locationInfo?.county || "",
  );
  const [subCountyId, setSubCountyId] = useState(
    lockedSubCountyId || locationInfo?.subCounty || "",
  );
  const [wardId, setWardId] = useState(locationInfo?.ward ?? "");
  const [facilities, setFacilities] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fhirApi
      .getCounties()
      .then(setCounties)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!countyId) {
      setSubCounties([]);
      return;
    }
    fhirApi
      .getSubCounties(countyId)
      .then(setSubCounties)
      .catch((e) => setError(e.message));
  }, [countyId]);

  useEffect(() => {
    if (!subCountyId) {
      setWards([]);
      return;
    }
    fhirApi
      .getWards(subCountyId)
      .then(setWards)
      .catch((e) => setError(e.message));
  }, [subCountyId]);

  useEffect(() => {
    let cancelled = false;
    const loadFacilities = async () => {
      setLoading(true);
      setError(null);
      try {
        // Pick the smallest selected scope and let HAPI walk the partof chain
        // server-side via `_revinclude:iterate` (one request, whole sub-tree).
        const rootId = wardId || subCountyId || countyId || null;

        if (rootId === null) {
          // National view - bounded page to avoid flooding the map.
          const res = await locationApi.getLocations(1, 500, "FACILITY");
          if (!cancelled) setFacilities(res.locations);
          return;
        }

        const facilities = await getDescendantFacilities(rootId);
        if (!cancelled) setFacilities(facilities);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadFacilities();
    return () => {
      cancelled = true;
    };
  }, [countyId, subCountyId, wardId]);

  const missingPositions = facilities.filter((f) => !f.position).length;

  return (
    <div className="card p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={countyId}
          onChange={(e) => {
            setCountyId(e.target.value);
            setSubCountyId("");
            setWardId("");
          }}
          disabled={!!scopeLock}
          className="select-styled"
        >
          {!scopeLock && <option value="">All counties</option>}
          {counties
            .filter((c) => (scopeLock ? c.id === lockedCountyId : true))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select
          value={subCountyId}
          onChange={(e) => {
            setSubCountyId(e.target.value);
            setWardId("");
          }}
          disabled={!countyId || scopeLock?.typeCode === "SUB-COUNTY"}
          className="select-styled"
        >
          {scopeLock?.typeCode !== "SUB-COUNTY" && (
            <option value="">All sub-counties</option>
          )}
          {subCounties
            .filter((s) =>
              scopeLock?.typeCode === "SUB-COUNTY"
                ? s.id === scopeLock.id
                : true,
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <select
          value={wardId}
          onChange={(e) => setWardId(e.target.value)}
          disabled={!subCountyId}
          className="select-styled"
        >
          <option value="">All wards</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="chip bg-accent-50 text-accent-700">{error}</div>
      )}

      <div className="text-xs text-gray-600 flex items-center justify-between">
        <span className="flex items-center gap-2">
          {loading ? (
            <Spinner size="sm" label="Loading facilities…" />
          ) : (
            `${facilities.length} facilities`
          )}
        </span>
        {missingPositions > 0 && (
          <span className="chip bg-amber-100 text-amber-800">
            {missingPositions} without coordinates
          </span>
        )}
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
            <Spinner size="lg" />
          </div>
        )}
        <LocationMap locations={facilities} />
      </div>
    </div>
  );
}
