"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TreeRecord } from "@/lib/types";

// ─── Map Tile Providers ─────────────────────────────────────────────────────

type MapStyle = "google_hybrid" | "esri_satellite" | "osm";

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
    attribution: "&copy; Esri World Imagery",
    maxZoom: 24,
    maxNativeZoom: 19,
  },
  osm: {
    id: "osm",
    name: "Street Map",
    badge: "Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 24,
    maxNativeZoom: 19,
  },
};

// ─── Distance & Bearing Math ────────────────────────────────────────────────

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters: number): string {
  if (meters < 1) return "< 1 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function getCompassHeadingName(bearing: number): string {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round(bearing / 22.5) % 16;
  return directions[index];
}

// ─── Custom Icons ───────────────────────────────────────────────────────────

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

const USER_ICON = createUserLocationIcon();

function createTreeDestinationIcon(tree: TreeRecord): L.DivIcon {
  const size = 38;
  const half = size / 2;
  const color = tree.is_affected ? "#ef4444" : "#22c55e";

  const html = `
    <div class="relative flex items-center justify-center cursor-pointer select-none" style="width: ${size}px; height: ${size}px;">
      <!-- Glowing pulse ring around destination -->
      <div class="absolute -inset-1.5 rounded-full animate-ping opacity-50" style="background: ${color};"></div>
      <!-- Core icon badge -->
      <div class="w-full h-full rounded-full flex items-center justify-center text-white text-base shadow-2xl z-10"
           style="background: ${color}; border: 3px solid #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.65);">
        🌳
      </div>
      <!-- Destination Tree ID Label -->
      <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold whitespace-nowrap border shadow-xl z-20"
           style="background: rgba(10, 12, 16, 0.95); border-color: rgba(255,255,255,0.25); color: #ffffff;">
        ${tree.tree_id || "TREE"}
      </div>
    </div>`;

  return L.divIcon({
    html,
    className: "destination-tree-marker",
    iconSize: [size, size + 24],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

// ─── User Location Tracker Hook & Controller ────────────────────────────────

interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

function LiveLocationTracker({
  onLocationUpdate,
  onError,
}: {
  onLocationUpdate: (loc: UserLocation) => void;
  onError: (msg: string) => void;
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      onError("Geolocation is not supported by your browser");
      return;
    }

    const handlePos = (pos: GeolocationPosition) => {
      onLocationUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    };

    const handleErr = (err: GeolocationPositionError) => {
      console.warn("GPS tracking error:", err);
      onError(err.message || "Failed to retrieve your GPS location");
    };

    navigator.geolocation.getCurrentPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    const watchId = navigator.geolocation.watchPosition(handlePos, handleErr, {
      enableHighAccuracy: true,
      maximumAge: 1000,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [onLocationUpdate, onError]);

  return null;
}

// ─── Auto Fit Route Bounds Controller ───────────────────────────────────────

function RouteFitController({
  userLocation,
  treeLocation,
  triggerFit,
}: {
  userLocation: UserLocation | null;
  treeLocation: [number, number];
  triggerFit: number;
}) {
  const map = useMap();
  const initialFittedRef = useRef(false);

  useEffect(() => {
    if (!userLocation) {
      // Just fly to tree if no user location yet
      if (!initialFittedRef.current) {
        map.setView(treeLocation, 19);
      }
      return;
    }

    const bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      treeLocation,
    ]);

    map.fitBounds(bounds, {
      padding: [70, 70],
      maxZoom: 20,
      animate: true,
      duration: 0.8,
    });
    initialFittedRef.current = true;
  }, [userLocation, treeLocation, map, triggerFit]);

  return null;
}

// ─── Camera Controller for Map Actions ──────────────────────────────────────

function CameraController({
  targetPos,
  targetZoom,
}: {
  targetPos: [number, number] | null;
  targetZoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (targetPos) {
      map.flyTo(targetPos, targetZoom, { duration: 0.8 });
    }
  }, [targetPos, targetZoom, map]);

  return null;
}

// ─── Modal Props ────────────────────────────────────────────────────────────

interface NavigateToTreeModalProps {
  isOpen: boolean;
  tree: TreeRecord | null;
  onClose: () => void;
}

export default function NavigateToTreeModal({
  isOpen,
  tree,
  onClose,
}: NavigateToTreeModalProps) {
  const [activeStyle, setActiveStyle] = useState<MapStyle>("google_hybrid");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [fitCounter, setFitCounter] = useState(0);
  const [cameraTarget, setCameraTarget] = useState<[number, number] | null>(null);
  const [cameraZoom, setCameraZoom] = useState(19);

  // Reset state when tree changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setGpsError(null);
      setFitCounter((c) => c + 1);
    }
  }, [isOpen, tree?.id]);

  // Handle ESC key to exit navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !tree) return null;

  const treeCoords: [number, number] = [tree.latitude, tree.longitude];

  // Calculate live navigation distance and bearing
  const distanceMeters = userLocation
    ? calculateDistanceMeters(
        userLocation.lat,
        userLocation.lng,
        tree.latitude,
        tree.longitude
      )
    : null;

  const bearing = userLocation
    ? calculateBearing(
        userLocation.lat,
        userLocation.lng,
        tree.latitude,
        tree.longitude
      )
    : null;

  const headingText = bearing !== null ? getCompassHeadingName(bearing) : "";

  // Estimated walking time (average walking speed 1.2 m/s)
  const walkingTimeSeconds =
    distanceMeters !== null ? Math.round(distanceMeters / 1.2) : null;
  const walkingTimeText =
    walkingTimeSeconds !== null
      ? walkingTimeSeconds < 60
        ? `${walkingTimeSeconds}s walk`
        : `${Math.round(walkingTimeSeconds / 60)} min walk`
      : "";

  const currentProvider = TILE_PROVIDERS[activeStyle];

  const handleCenterOnUser = () => {
    if (userLocation) {
      setCameraTarget([userLocation.lat, userLocation.lng]);
      setCameraZoom(20);
    }
  };

  const handleCenterOnTree = () => {
    setCameraTarget(treeCoords);
    setCameraZoom(20);
  };

  const handleFitRoute = () => {
    setFitCounter((c) => c + 1);
  };

  const openGoogleMapsDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${tree.latitude},${tree.longitude}&travelmode=walking`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col w-screen h-screen bg-zinc-950 overflow-hidden select-none">
      {/* ─── Top Control Bar: Exit button & Destination Info ─────────────── */}
      <header className="absolute top-0 inset-x-0 z-[2500] pointer-events-none p-3 sm:p-4 flex items-start justify-between gap-2">
        {/* Left: Destination Info & Live Metrics HUD */}
        <div className="pointer-events-auto max-w-[calc(100%-110px)] sm:max-w-md bg-black/80 backdrop-blur-xl border border-white/15 p-2.5 sm:p-3 rounded-2xl shadow-2xl space-y-1.5 text-white">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs">
              {tree.tree_id || "TREE"}
            </span>

            <span className="text-xs font-semibold text-zinc-200 capitalize">
              {tree.variety || tree.type}
            </span>

            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
              {tree.farm_location || "Attuvampatti"}
            </span>
          </div>

          {/* Live Navigation Status & Metrics */}
          <div className="flex items-center gap-2 text-xs flex-wrap pt-0.5">
            {distanceMeters !== null ? (
              <div className="flex items-center gap-1.5 font-bold text-sky-300 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-lg">
                <svg className="w-3.5 h-3.5 animate-pulse text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="3 11 22 2 13 21 11 13 3 11" />
                </svg>
                <span>{formatDistance(distanceMeters)}</span>
                {headingText && (
                  <span className="text-sky-400 font-mono text-[11px]">
                    ({headingText} · {Math.round(bearing || 0)}°)
                  </span>
                )}
                {walkingTimeText && (
                  <span className="text-zinc-400 font-normal text-[10px] hidden xs:inline">
                    · {walkingTimeText}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Acquiring your GPS position…</span>
              </div>
            )}

            {userLocation?.accuracy && (
              <span className="text-[10px] text-zinc-400 font-mono">
                ±{Math.round(userLocation.accuracy)}m
              </span>
            )}
          </div>
        </div>

        {/* Right: Exit / Close Button (High contrast, clearly visible) */}
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs shadow-2xl flex items-center gap-2 border border-red-400/50 backdrop-blur-md transition-all cursor-pointer shrink-0"
          title="Exit Navigation"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span className="tracking-wide uppercase">Exit</span>
        </button>
      </header>

      {/* ─── Map Styles Toolbar (Top-center or below HUD) ────────────────── */}
      <div className="absolute top-20 sm:top-20 left-3 z-[2400] flex items-center gap-1 p-1 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 shadow-xl">
        {(Object.keys(TILE_PROVIDERS) as MapStyle[]).map((key) => {
          const provider = TILE_PROVIDERS[key];
          const isActive = activeStyle === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveStyle(key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {provider.badge}
            </button>
          );
        })}
      </div>

      {/* ─── Fullscreen Leaflet Map ─────────────────────────────────────── */}
      <div className="relative flex-1 w-full h-full">
        <MapContainer
          center={treeCoords}
          zoom={19}
          maxZoom={24}
          minZoom={2}
          style={{ width: "100%", height: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            key={activeStyle}
            attribution={currentProvider.attribution}
            url={currentProvider.url}
            maxZoom={currentProvider.maxZoom}
            maxNativeZoom={currentProvider.maxNativeZoom}
          />

          {/* Live location tracker */}
          <LiveLocationTracker
            onLocationUpdate={(loc) => {
              setUserLocation(loc);
              setGpsError(null);
            }}
            onError={(msg) => setGpsError(msg)}
          />

          {/* Route fit controller */}
          <RouteFitController
            userLocation={userLocation}
            treeLocation={treeCoords}
            triggerFit={fitCounter}
          />

          {/* Camera controller for manual button taps */}
          <CameraController targetPos={cameraTarget} targetZoom={cameraZoom} />

          {/* ─── NAVIGATION LINE: from user location to tree destination ──── */}
          {userLocation && (
            <>
              {/* Outer soft glowing halo line */}
              <Polyline
                positions={[
                  [userLocation.lat, userLocation.lng],
                  treeCoords,
                ]}
                pathOptions={{
                  color: "#0284c7",
                  weight: 8,
                  opacity: 0.45,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              {/* Core vibrant dashed line */}
              <Polyline
                positions={[
                  [userLocation.lat, userLocation.lng],
                  treeCoords,
                ]}
                pathOptions={{
                  color: "#38bdf8",
                  weight: 4,
                  opacity: 0.95,
                  dashArray: "10, 8",
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </>
          )}

          {/* ─── User Marker (Pulsing Beacon) ───────────────────────────── */}
          {userLocation && (
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={USER_ICON}
            >
              <Popup className="tree-popup">
                <div className="p-2.5 text-center text-xs text-white">
                  <div className="font-bold flex items-center justify-center gap-1.5 text-blue-400">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span>Your Current Position</span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-400 mt-1">
                    {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                  </p>
                  {distanceMeters !== null && (
                    <p className="text-sky-300 font-semibold mt-1">
                      {formatDistance(distanceMeters)} to {tree.tree_id}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* ─── Destination Tree Marker ─────────────────────────────────── */}
          <Marker position={treeCoords} icon={createTreeDestinationIcon(tree)}>
            <Popup className="tree-popup">
              <div className="p-3 text-white space-y-1.5 text-xs">
                <div className="font-bold text-sm text-emerald-400 flex items-center justify-between">
                  <span>Destination: {tree.tree_id}</span>
                  <span className="text-[10px] uppercase text-zinc-400">{tree.type}</span>
                </div>
                {tree.variety && (
                  <p className="text-zinc-300">
                    <strong>Variety:</strong> {tree.variety}
                  </p>
                )}
                <p className="font-mono text-[10px] text-zinc-400">
                  {tree.latitude.toFixed(6)}, {tree.longitude.toFixed(6)}
                </p>
                {distanceMeters !== null && (
                  <div className="pt-1 border-t border-zinc-800 text-sky-300 font-bold">
                    Distance: {formatDistance(distanceMeters)}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* ─── Floating Map Control Buttons (Right Side) ──────────────────── */}
      <div className="absolute right-3 bottom-24 z-[2400] flex flex-col gap-2">
        {/* Fit Both Route Points */}
        <button
          type="button"
          onClick={handleFitRoute}
          className="p-3 rounded-xl bg-black/80 hover:bg-black text-white border border-white/20 shadow-xl backdrop-blur-md active:scale-95 transition-all"
          title="Fit route in view"
        >
          <svg className="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>

        {/* Center on User */}
        <button
          type="button"
          onClick={handleCenterOnUser}
          disabled={!userLocation}
          className="p-3 rounded-xl bg-black/80 hover:bg-black text-white border border-white/20 shadow-xl backdrop-blur-md active:scale-95 transition-all disabled:opacity-40"
          title="Center on my location"
        >
          <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
          </svg>
        </button>

        {/* Center on Destination Tree */}
        <button
          type="button"
          onClick={handleCenterOnTree}
          className="p-3 rounded-xl bg-black/80 hover:bg-black text-white border border-white/20 shadow-xl backdrop-blur-md active:scale-95 transition-all"
          title="Center on target tree"
        >
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L4 12h5v8h6v-8h5z" />
          </svg>
        </button>
      </div>

      {/* ─── Bottom Navigation HUD ──────────────────────────────────────── */}
      <footer className="absolute bottom-3 inset-x-3 sm:inset-x-6 z-[2400] max-w-xl mx-auto">
        <div className="bg-black/90 backdrop-blur-xl border border-white/20 p-3 sm:p-4 rounded-2xl shadow-2xl text-white space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="font-bold text-sm tracking-wide text-zinc-100">
                  Navigating to {tree.tree_id}
                </h3>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                Target: {tree.latitude.toFixed(6)}, {tree.longitude.toFixed(6)}
              </p>
            </div>

            {/* Google Maps External Directions */}
            <button
              type="button"
              onClick={openGoogleMapsDirections}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/15 active:scale-95 transition-all shrink-0"
              title="Open turn-by-turn directions in Google Maps app"
            >
              <span>Google Maps</span>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </div>

          {/* Arrived Banner if within 3 meters */}
          {distanceMeters !== null && distanceMeters <= 3 && (
            <div className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 animate-bounce">
              <span>🎯 You have arrived at tree {tree.tree_id}!</span>
            </div>
          )}

          {/* GPS error toast if GPS fails */}
          {gpsError && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] flex items-center justify-between">
              <span>⚠️ {gpsError}</span>
              <button
                type="button"
                onClick={() => setFitCounter((c) => c + 1)}
                className="underline font-bold text-[10px] ml-2"
              >
                Retry GPS
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

