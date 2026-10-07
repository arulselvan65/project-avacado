"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Satellite / Map Style Providers ─────────────────────────────────────────

export type MapStyle = "google_hybrid" | "google_satellite" | "esri_satellite" | "osm";

interface TileProvider {
  id: MapStyle;
  name: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
}

const TILE_PROVIDERS: Record<MapStyle, TileProvider> = {
  google_hybrid: {
    id: "google_hybrid",
    name: "Satellite Hybrid",
    label: "Hybrid",
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    maxZoom: 24,
    maxNativeZoom: 20,
  },
  google_satellite: {
    id: "google_satellite",
    name: "Pure Satellite",
    label: "Satellite",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    maxZoom: 24,
    maxNativeZoom: 20,
  },
  esri_satellite: {
    id: "esri_satellite",
    name: "Esri Satellite",
    label: "Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 24,
    maxNativeZoom: 19,
  },
  osm: {
    id: "osm",
    name: "Street Map",
    label: "Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 24,
    maxNativeZoom: 19,
  },
};

// ─── Custom Draggable Pin Icon ────────────────────────────────────────────────

function createDraggablePinIcon(size = 36): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.5}">
      <defs>
        <filter id="pin-shadow" x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.4"/>
        </filter>
      </defs>
      <g filter="url(#pin-shadow)">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
              fill="#2d9d5e" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="5" fill="#ffffff"/>
        <circle cx="12" cy="12" r="2.5" fill="#1a6b3a"/>
      </g>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "draggable-marker-icon",
    iconSize: [size, size * 1.5],
    iconAnchor: [size / 2, size * 1.5],
  });
}

const DRAGGABLE_PIN_ICON = createDraggablePinIcon();

// ─── Map Event Listeners Component ──────────────────────────────────────────

interface MapClickEventsProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

function MapClickEvents({ onLocationSelect }: MapClickEventsProps) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ─── Map Recenter Component ─────────────────────────────────────────────────

interface MapRecenterProps {
  lat: number | null;
  lng: number | null;
}

function MapRecenter({ lat, lng }: MapRecenterProps) {
  const map = useMap();
  const lastCoords = useRef<string>("");

  useEffect(() => {
    if (
      lat !== null &&
      lng !== null &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      (lat !== 0 || lng !== 0)
    ) {
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (lastCoords.current !== key) {
        lastCoords.current = key;
        const currentZoom = map.getZoom();
        const targetZoom = currentZoom < 17 ? 19 : currentZoom;
        map.flyTo([lat, lng], targetZoom, { duration: 0.8 });
      }
    }
  }, [lat, lng, map]);

  return null;
}

// ─── Main LocationPickerMap Component ───────────────────────────────────────

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
}

export default function LocationPickerMap({
  lat,
  lng,
  onLocationSelect,
}: LocationPickerMapProps) {
  const [activeStyle, setActiveStyle] = useState<MapStyle>("google_hybrid");
  const markerRef = useRef<L.Marker | null>(null);

  const hasCoords =
    lat !== null &&
    lng !== null &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    (lat !== 0 || lng !== 0);

  // Default initial center if no coordinates provided yet
  const center: [number, number] = hasCoords
    ? [lat, lng]
    : [12.9716, 77.5946];

  const currentProvider = TILE_PROVIDERS[activeStyle];

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const pos = marker.getLatLng();
          onLocationSelect(pos.lat, pos.lng);
        }
      },
    }),
    [onLocationSelect]
  );

  return (
    <div
      className="relative w-full h-[320px] overflow-hidden"
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-primary)",
      }}
    >
      {/* ── Layer Switcher ── */}
      <div
        className="absolute top-2.5 right-2.5 z-[1000] flex items-center gap-0.5 p-1 rounded-lg"
        style={{
          background: "rgba(10, 12, 16, 0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {(Object.keys(TILE_PROVIDERS) as MapStyle[]).map((key) => {
          const provider = TILE_PROVIDERS[key];
          const isActive = activeStyle === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveStyle(key)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
              style={{
                background: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
              }}
            >
              {provider.label}
            </button>
          );
        })}
      </div>

      {/* ── Instruction Banner ── */}
      <div
        className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full text-[11px] font-medium text-center pointer-events-none flex items-center gap-1.5 whitespace-nowrap"
        style={{
          background: "rgba(10, 12, 16, 0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(45, 157, 94, 0.3)",
          color: "var(--text-secondary)",
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "var(--accent)" }}
        />
        Drag pin or tap to set position
      </div>

      {/* ── Leaflet Map ── */}
      <MapContainer
        center={center}
        zoom={hasCoords ? 19 : 14}
        maxZoom={24}
        minZoom={2}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          key={activeStyle}
          attribution={currentProvider.attribution}
          url={currentProvider.url}
          maxZoom={currentProvider.maxZoom}
          maxNativeZoom={currentProvider.maxNativeZoom}
        />

        <MapRecenter lat={lat} lng={lng} />
        <MapClickEvents onLocationSelect={onLocationSelect} />

        {hasCoords && (
          <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[lat, lng]}
            icon={DRAGGABLE_PIN_ICON}
            ref={markerRef}
          />
        )}
      </MapContainer>
    </div>
  );
}
