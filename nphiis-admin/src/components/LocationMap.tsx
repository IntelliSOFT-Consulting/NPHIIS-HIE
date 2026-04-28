"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Location } from "@/types/location";

interface LocationMapProps {
  locations: Location[];
  height?: string;
}

const KENYA_CENTER: [number, number] = [-0.0236, 37.9062];
const DEFAULT_ZOOM = 6;

// Imperative Leaflet (not react-leaflet) because react-leaflet's MapContainer
// throws "Map container is already initialized" under React 18 strict mode -
// its init effect fires twice but the DOM node still carries _leaflet_id.
export default function LocationMap({
  locations,
  height = "70vh",
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanupMap: (() => void) | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })
        ._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current).setView(
        KENYA_CENTER,
        DEFAULT_ZOOM,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      mapRef.current = map;
      cleanupMap = () => {
        map.remove();
        mapRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      cleanupMap?.();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    (async () => {
      const L = (await import("leaflet")).default;
      const placed = locations.filter(
        (l) =>
          typeof l.position?.latitude === "number" &&
          typeof l.position?.longitude === "number",
      );

      // Remove any previous marker layer group.
      map.eachLayer((layer) => {
        if ((layer as { _isFacilityLayer?: boolean })._isFacilityLayer) {
          map.removeLayer(layer);
        }
      });

      const group = L.layerGroup().addTo(map);
      (group as unknown as { _isFacilityLayer: boolean })._isFacilityLayer =
        true;

      placed.forEach((l) => {
        L.marker([l.position!.latitude, l.position!.longitude])
          .bindPopup(
            `<div style="font-size:12px">
               <div style="font-weight:600">${escapeHtml(l.name)}</div>
               ${l.type ? `<div style="color:#6b7280">${escapeHtml(l.type)}</div>` : ""}
               ${l.parentName ? `<div style="color:#9ca3af">In: ${escapeHtml(l.parentName)}</div>` : ""}
             </div>`,
          )
          .addTo(group);
      });

      if (placed.length > 0) {
        const bounds = L.latLngBounds(
          placed.map((l) => [l.position!.latitude, l.position!.longitude]),
        );
        map.fitBounds(bounds.pad(0.1), { maxZoom: 12 });
      }
    })();
  }, [locations]);

  return <div ref={containerRef} style={{ height, width: "100%" }} />;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
}
