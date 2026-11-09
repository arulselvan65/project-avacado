"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TreeReviewItem } from "@/lib/reviewTypes";

// ─── Satellite / Map Style Providers ─────────────────────────────────────────

export type MapStyle = "google_hybrid" | "google_satellite" | "esri_satellite" | "osm";

interface TileProvider {
  id: MapStyle;
  name: string;
  badge: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
}

const TILE_PROVIDERS: Record<MapStyle, TileProvider> = {
  google_hybrid: {
    id: "google_hybrid",
    name: "Satellite Hybrid",
    badge: "Hybrid",
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    maxZoom: 24,
    maxNativeZoom: 20,
  },
  esri_satellite: {
    id: "esri_satellite",
    name: "Esri Satellite",
    badge: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 24,
    maxNativeZoom: 19,
  },
  google_satellite: {
    id: "google_satellite",
    name: "Pure Satellite",
    badge: "Imagery",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    maxZoom: 24,
    maxNativeZoom: 20,
  },
  osm: {
    id: "osm",
    name: "Street Map",
    badge: "Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 24,
    maxNativeZoom: 19,
  },
};

// ─── Custom Review Map Marker Icons ──────────────────────────────────────────

function createReviewMarkerIcon(item: TreeReviewItem, isSelected = false): L.DivIcon {
  const size = isSelected ? 38 : 30;
  const half = size / 2;

  let bg = "#f59e0b"; // amber for pending
  let stroke = "#ffffff";
  let symbol = "?";
  let shadowColor = "rgba(245, 158, 11, 0.4)";

  if (item.status === "ok") {
    bg = "#22c55e"; // green for OK
    symbol = "✓";
    shadowColor = "rgba(34, 197, 94, 0.5)";
  } else if (item.status === "affected") {
    bg = "#ef4444"; // red for affected
    symbol = "!";
    shadowColor = "rgba(239, 68, 68, 0.6)";
  }

  const pulseRing = item.status === "affected"
    ? `<div class="absolute -inset-1.5 rounded-full bg-red-500/30 animate-ping pointer-events-none"></div>`
    : "";

  const html = `
    <div class="relative flex items-center justify-center cursor-pointer select-none group" style="width: ${size}px; height: ${size}px;">
      ${pulseRing}
      <!-- Circular Core Pin -->
      <div class="w-full h-full rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xl transition-transform group-hover:scale-110 active:scale-95"
           style="background: ${bg}; border: 2.5px solid ${stroke}; box-shadow: 0 4px 12px ${shadowColor}; font-size: ${isSelected ? "14px" : "11px"};">
        ${symbol}
      </div>
      <!-- Floating Label with Tree ID -->
      <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold whitespace-nowrap pointer-events-none border shadow-md"
           style="background: rgba(10, 12, 16, 0.88); border-color: rgba(255,255,255,0.15); color: #f8fafc;">
        ${item.tree_id}
      </div>
    </div>`;

  return L.divIcon({
    html,
    className: "review-tree-marker",
    iconSize: [size, size + 16],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

// ─── Google Maps Style User Location Icon ───────────────────────────────────

function createUserLocationIcon(): L.DivIcon {
  const html = `
    <div class="user-location-marker">
      <div class="user-location-pulse"></div>
      <div class="user-location-core" title="You are here"></div>
    </div>`;

  return L.divIcon({
    html,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

const USER_LOCATION_ICON = createUserLocationIcon();

interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

// ─── User Location Tracker ──────────────────────────────────────────────────

function UserLocationTracker({
  isActive,
  onLocationUpdate,
}: {
  isActive: boolean;
  onLocationUpdate: (loc: UserLocation) => void;
}) {
  const map = useMap();
  const hasCenteredRef = useRef(false);

  useEffect(() => {
    if (!isActive || typeof window === "undefined" || !navigator.geolocation) {
      return;
    }

    const applyPos = (pos: GeolocationPosition, center: boolean) => {
      const loc: UserLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      onLocationUpdate(loc);

      if (center && !hasCenteredRef.current) {
        hasCenteredRef.current = true;
        map.flyTo([loc.lat, loc.lng], 19, { duration: 0.8 });
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => applyPos(pos, true),
      (err) => console.warn("GPS error:", err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => applyPos(pos, false),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isActive, map, onLocationUpdate]);

  return null;
}

// ─── Locate Button ──────────────────────────────────────────────────────────

function LocateButton({
  isLocating,
  userLocation,
  onActivate,
}: {
  isLocating: boolean;
  userLocation: UserLocation | null;
  onActivate: () => void;
}) {
  const map = useMap();

  const handleClick = () => {
    if (!isLocating) {
      onActivate();
    } else if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 19, { duration: 0.8 });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isLocating ? "Re-center to my location" : "Locate my position"}
      className="fixed bottom-24 right-4 z-[1000] px-3.5 py-2.5 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2 transition-all hover:scale-105 active:scale-95 border"
      style={{
        background: isLocating ? "rgba(45, 157, 94, 0.9)" : "rgba(17, 20, 27, 0.88)",
        borderColor: "var(--border-secondary)",
        color: "#ffffff",
      }}
    >
      <svg
        className={`w-4 h-4 ${isLocating ? "text-white animate-pulse" : "text-emerald-400"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="7" />
        <line x1="12" y1="1" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="1" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="23" y2="12" />
      </svg>
      <span className="text-xs font-semibold">
        {isLocating ? "My Location" : "Locate Me"}
      </span>
    </button>
  );
}

// ─── FitBounds Component ───────────────────────────────────────────────────

function FitBounds({
  items,
  hasUserLoc,
}: {
  items: TreeReviewItem[];
  hasUserLoc: boolean;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (hasUserLoc || hasFittedRef.current || items.length === 0) return;
    hasFittedRef.current = true;

    if (items.length === 1) {
      map.flyTo([items[0].latitude, items[0].longitude], 19, { duration: 0.8 });
      return;
    }

    const bounds = L.latLngBounds(items.map((i) => [i.latitude, i.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
  }, [map, items, hasUserLoc]);

  return null;
}

// ─── Center on Selected Tree ───────────────────────────────────────────────

function SelectedTreeController({
  selectedItem,
}: {
  selectedItem?: TreeReviewItem | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (selectedItem && selectedItem.latitude && selectedItem.longitude) {
      map.panTo([selectedItem.latitude, selectedItem.longitude], {
        animate: true,
        duration: 0.6,
      });
    }
  }, [selectedItem, map]);
  return null;
}

// ─── Main ReviewMapView Component ──────────────────────────────────────────

interface ReviewMapViewProps {
  items: TreeReviewItem[];
  selectedTreeId: string | null;
  onSelectTree: (item: TreeReviewItem) => void;
}

export default function ReviewMapView({
  items,
  selectedTreeId,
  onSelectTree,
}: ReviewMapViewProps) {
  const [activeStyle, setActiveStyle] = useState<MapStyle>("google_hybrid");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const handleLocationUpdate = useCallback((loc: UserLocation) => {
    setUserLocation(loc);
  }, []);

  const selectedItem = useMemo(() => {
    return items.find((i) => i.tree_id === selectedTreeId) || null;
  }, [items, selectedTreeId]);

  const currentProvider = TILE_PROVIDERS[activeStyle];

  const defaultCenter: [number, number] = items.length > 0
    ? [items[0].latitude, items[0].longitude]
    : [10.273365, 77.479212];

  return (
    <div className="relative w-full h-full min-h-[500px]">
      {/* Layer Switcher */}
      <div
        className="absolute top-3 left-3 z-[1000] flex items-center gap-1 p-1 rounded-xl backdrop-blur-md shadow-lg"
        style={{
          background: "rgba(17, 20, 27, 0.88)",
          border: "1px solid var(--border-secondary)",
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
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {provider.badge}
            </button>
          );
        })}
      </div>

      {/* Floating Instructions */}
      <div
        className="absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md shadow-lg border hidden sm:flex items-center gap-1.5"
        style={{
          background: "rgba(17, 20, 27, 0.88)",
          borderColor: "var(--border-secondary)",
          color: "var(--text-secondary)",
        }}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>Tap any tree pin to review OK / Affected</span>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={18}
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

        <UserLocationTracker
          isActive={isLocating}
          onLocationUpdate={handleLocationUpdate}
        />

        <FitBounds items={items} hasUserLoc={userLocation !== null} />
        <SelectedTreeController selectedItem={selectedItem} />

        <LocateButton
          isLocating={isLocating}
          userLocation={userLocation}
          onActivate={() => setIsLocating(true)}
        />

        {/* User GPS beacon */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={USER_LOCATION_ICON}
          />
        )}

        {/* Review Tree Markers */}
        {items.map((item) => {
          const isSelected = selectedTreeId === item.tree_id;
          return (
            <Marker
              key={item.tree_id}
              position={[item.latitude, item.longitude]}
              icon={createReviewMarkerIcon(item, isSelected)}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onSelectTree(item);
                },
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}

