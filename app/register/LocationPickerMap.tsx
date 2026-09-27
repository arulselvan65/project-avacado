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
  badge: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

const TILE_PROVIDERS: Record<MapStyle, TileProvider> = {
  google_hybrid: {
    id: "google_hybrid",
    name: "Satellite Hybrid",
    badge: "🛰️ Hybrid",
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    maxZoom: 20,
  },
  google_satellite: {
    id: "google_satellite",
    name: "Pure Satellite",
    badge: "📷 Pure Sat",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    maxZoom: 20,
  },
  esri_satellite: {
    id: "esri_satellite",
    name: "Esri Satellite",
    badge: "🌎 Esri Earth",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
  osm: {
    id: "osm",
    name: "Street Map",
    badge: "🗺️ Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
};

// ─── Custom Draggable Pin Icon ────────────────────────────────────────────────

function createDraggablePinIcon(size = 38): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.5}">
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
      </filter>
      <g filter="url(#shadow)">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
              fill="#22c55e" stroke="#ffffff" stroke-width="2"/>
        <circle cx="12" cy="12" r="5" fill="#ffffff"/>
        <circle cx="12" cy="12" r="2.5" fill="#15803d"/>
      </g>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "draggable-marker-icon",
    iconSize: [size, size * 1.5],
    iconAnchor: [size / 2, size * 1.5], // Bottom point of pin
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
    <div className="relative w-full h-[320px] rounded-2xl overflow-hidden border border-[var(--input-border)] shadow-inner">
      {/* ── Layer Switcher Toolbar ── */}
      <div
        className="absolute top-2 right-2 z-[1000] flex items-center gap-1 p-1 rounded-xl backdrop-blur-md shadow-md"
        style={{
          background: "rgba(15, 17, 23, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
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
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? "bg-emerald-600 text-white shadow"
                  : "text-gray-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {provider.badge}
            </button>
          );
        })}
      </div>

      {/* ── Instruction Banner ── */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full text-xs font-medium text-center backdrop-blur-md shadow-md pointer-events-none flex items-center gap-1.5 whitespace-nowrap"
        style={{
          background: "rgba(15, 17, 23, 0.9)",
          border: "1px solid rgba(34, 197, 94, 0.4)",
          color: "var(--foreground)",
        }}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>Drag pin or click map to set exact tree position</span>
      </div>

      {/* ── Leaflet Map ── */}
      <MapContainer
        center={center}
        zoom={hasCoords ? 19 : 14}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          key={activeStyle}
          attribution={currentProvider.attribution}
          url={currentProvider.url}
          maxZoom={currentProvider.maxZoom}
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
