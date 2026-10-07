"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type TreeRecord, getVarietyImageUrls } from "@/lib/types";

// ─── Map Style / Tile Provider Configurations ──────────────────────────────

export type MapStyle = "google_hybrid" | "esri_satellite" | "google_satellite" | "osm";

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
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community",
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
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 24,
    maxNativeZoom: 19,
  },
};

// ─── Marker Dot Icon Factory ────────────────────────────────────────────────

function getMarkerColor(record: TreeRecord): string {
  if (record.is_affected) return "#ef4444";
  if (record.type === "plant") return "#86efac";
  return "#22c55e";
}

function createDotIcon(color: string, isSelected = false): L.DivIcon {
  const size = isSelected ? 34 : 26;
  const half = size / 2;
  const haloR = isSelected ? 14 : 10;
  const coreR = isSelected ? 7.5 : 6;
  const innerR = isSelected ? 3 : 2;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <defs>
        <filter id="dot-shadow-${size}" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.65"/>
        </filter>
      </defs>
      <!-- Translucent outer halo / touch buffer -->
      <circle cx="${half}" cy="${half}" r="${haloR}" fill="${color}" fill-opacity="${isSelected ? 0.45 : 0.22}"
              stroke="${isSelected ? '#ffffff' : color}" stroke-width="${isSelected ? 2 : 1}"
              ${isSelected ? 'stroke-dasharray="3 2"' : ''}/>
      <!-- Core colored dot with crisp white border & drop shadow -->
      <circle cx="${half}" cy="${half}" r="${coreR}" fill="${color}" stroke="#ffffff" stroke-width="2.5" filter="url(#dot-shadow-${size})"/>
      <!-- Inner specular shine dot -->
      <circle cx="${half}" cy="${half}" r="${innerR}" fill="#ffffff" fill-opacity="0.95"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "tree-dot-marker",
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half - 4],
  });
}

const ICON_TREE = createDotIcon("#22c55e", false);
const ICON_TREE_SEL = createDotIcon("#22c55e", true);
const ICON_PLANT = createDotIcon("#86efac", false);
const ICON_PLANT_SEL = createDotIcon("#86efac", true);
const ICON_AFFECTED = createDotIcon("#ef4444", false);
const ICON_AFFECTED_SEL = createDotIcon("#ef4444", true);

function getMarkerIcon(record: TreeRecord, isSelected: boolean): L.DivIcon {
  if (record.is_affected) return isSelected ? ICON_AFFECTED_SEL : ICON_AFFECTED;
  if (record.type === "plant") return isSelected ? ICON_PLANT_SEL : ICON_PLANT;
  return isSelected ? ICON_TREE_SEL : ICON_TREE;
}

// ─── Google Maps Style User Location Icon (Clean pulsing blue beacon) ────────

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

// Fallback initial center if neither user location nor trees are available
const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];

interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

// ─── Geolocation Tracker & Auto-Zoom Component ───────────────────────────────

function UserLocationTracker({
  onLocationUpdate,
}: {
  onLocationUpdate: (loc: UserLocation) => void;
}) {
  const map = useMap();
  const hasCenteredRef = useRef(false);
  const bestAccuracyRef = useRef(Infinity);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    const applyLocation = (pos: GeolocationPosition, shouldCenter: boolean) => {
      const loc: UserLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      const acc = pos.coords.accuracy ?? Infinity;

      // Only update if this reading is more accurate, or if it's the first one, or if it's within a reasonable accuracy threshold.
      // This prevents the map from jumping from a good GPS fix (e.g. 15m) to a bad IP-based fix (e.g. 5000m).
      if (acc < bestAccuracyRef.current || bestAccuracyRef.current === Infinity || acc < 100) {
        bestAccuracyRef.current = Math.min(acc, bestAccuracyRef.current);
        onLocationUpdate(loc);

        // Center map on first accurate fix
        if (shouldCenter && !hasCenteredRef.current && acc < 1000) {
          hasCenteredRef.current = true;
          map.flyTo([loc.lat, loc.lng], 19, { duration: 1.2 });
        }
      }
    };

    // Phase 1: Get initial position (maximumAge: 0 = always fresh, no cache)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyLocation(pos, true);
      },
      (err) => {
        console.warn("Could not get initial user location:", err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    // Phase 2: Continuously watch position (maximumAge: 0 = always precise)
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        applyLocation(pos, true);
      },
      (err) => {
        console.warn("Geolocation watch error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [map, onLocationUpdate]);

  return null;
}

// ─── Re-center Floating Action Button ────────────────────────────────────────

function RecenterToUserButton({ userLocation }: { userLocation: UserLocation | null }) {
  const map = useMap();

  if (!userLocation) return null;

  return (
    <button
      type="button"
      onClick={() => {
        map.flyTo([userLocation.lat, userLocation.lng], 19, { duration: 0.8 });
      }}
      title="Re-center to my location"
      className="fixed bottom-24 right-4 z-[1000] w-11 h-11 rounded-xl shadow-xl backdrop-blur-md flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      style={{
        background: "rgba(17, 20, 27, 0.88)",
        border: "1px solid var(--border-secondary)",
        color: "var(--text-primary)",
      }}
      aria-label="Re-center to my location"
    >
      <svg
        className="w-5 h-5 text-emerald-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="7" />
        <line x1="12" y1="1" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="1" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="23" y2="12" />
      </svg>
    </button>
  );
}

// ─── FitBounds Component (Fallback when user location is unavailable) ────────

function FitBounds({
  trees,
  hasUserLocation,
}: {
  trees: TreeRecord[];
  hasUserLocation: boolean;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    // If user's location is active, let user location control initial view
    if (hasUserLocation || hasFittedRef.current) return;

    if (trees.length === 0) {
      map.setView(DEFAULT_CENTER, 14);
      return;
    }

    hasFittedRef.current = true;
    if (trees.length === 1) {
      map.flyTo([trees[0].latitude, trees[0].longitude], 19, { duration: 0.8 });
      return;
    }

    // Build a bounds array including all tree markers
    const points: L.LatLngTuple[] = trees.map((t) => [t.latitude, t.longitude]);
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
  }, [map, trees, hasUserLocation]);

  return null;
}

// ─── Horizontal 1-at-a-Time Image Carousel ───────────────────────────────────

function TreeImageCarousel({
  images,
  treeId,
}: {
  images: string[];
  treeId: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTo = (index: number) => {
    if (!scrollRef.current) return;
    const nextIdx = Math.max(0, Math.min(index, images.length - 1));
    setCurrentIndex(nextIdx);
    const container = scrollRef.current;
    container.scrollTo({
      left: nextIdx * container.clientWidth,
      behavior: "smooth",
    });
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const width = container.clientWidth;
    if (width > 0) {
      const idx = Math.round(container.scrollLeft / width);
      if (idx !== currentIndex && idx >= 0 && idx < images.length) {
        setCurrentIndex(idx);
      }
    }
  };

  if (images.length === 0) {
    return (
      <div className="w-full h-32 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col items-center justify-center text-slate-400 gap-2 my-2">
        <svg
          className="w-6 h-6 text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-xs">No photos attached</span>
      </div>
    );
  }

  return (
    <div
      className="relative w-full my-2 select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Scrollable Container - exactly 1 picture visible at a time */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex w-full overflow-x-auto snap-x snap-mandatory rounded-xl border border-white/10 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {images.map((src, i) => (
          <div
            key={i}
            className="min-w-full w-full shrink-0 snap-center aspect-[4/3] bg-black/60 relative flex items-center justify-center overflow-hidden"
          >
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-full block cursor-pointer"
              title="Click to view full photo"
            >
              <img
                src={src}
                alt={`${treeId} photo ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </a>
          </div>
        ))}
      </div>

      {/* Photo Counter Badge */}
      {images.length > 1 && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-black/80 text-white backdrop-blur-md border border-white/20 pointer-events-none">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Prev arrow button */}
      {images.length > 1 && currentIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            scrollTo(currentIndex - 1);
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/25 transition-transform active:scale-90 z-10"
          aria-label="Previous image"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Next arrow button */}
      {images.length > 1 && currentIndex < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            scrollTo(currentIndex + 1);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/25 transition-transform active:scale-90 z-10"
          aria-label="Next image"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Dot Indicators */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scrollTo(i);
              }}
              className={`h-1.5 rounded-full transition-all ${
                i === currentIndex
                  ? "w-4 bg-emerald-400"
                  : "w-1.5 bg-white/30 hover:bg-white/60"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main MapView Component ──────────────────────────────────────────────────

interface MapViewProps {
  trees: TreeRecord[];
}

export default function MapView({ trees }: MapViewProps) {
  const [activeStyle, setActiveStyle] = useState<MapStyle>("google_hybrid");
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const handleLocationUpdate = useCallback((loc: UserLocation) => {
    setUserLocation(loc);
  }, []);

  const currentProvider = TILE_PROVIDERS[activeStyle];

  const initialCenter: [number, number] =
    userLocation
      ? [userLocation.lat, userLocation.lng]
      : trees.length > 0
      ? [trees[0].latitude, trees[0].longitude]
      : DEFAULT_CENTER;

  return (
    <div className="relative w-full h-full">
      {/* Quick View Switcher Floating Toolbar */}
      <div
        className="fixed top-4 left-4 z-[1000] flex items-center gap-1 p-1 rounded-xl backdrop-blur-md shadow-lg transition-all"
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
              onClick={() => setActiveStyle(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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

      <MapContainer
        center={initialCenter}
        zoom={19}
        maxZoom={24}
        minZoom={2}
        style={{ width: "100%", height: "100vh" }}
        zoomControl={true}
      >
        {/* Dynamic active TileLayer synced with quick toolbar state */}
        <TileLayer
          key={activeStyle}
          attribution={currentProvider.attribution}
          url={currentProvider.url}
          maxZoom={currentProvider.maxZoom}
          maxNativeZoom={currentProvider.maxNativeZoom}
        />

        {/* User Location Tracker: Auto-detects GPS and zooms to live position */}
        <UserLocationTracker onLocationUpdate={handleLocationUpdate} />

        {/* Fallback bounds if user location is unavailable */}
        <FitBounds trees={trees} hasUserLocation={userLocation !== null} />

        {/* Floating Re-center to my location button */}
        <RecenterToUserButton userLocation={userLocation} />

        {/* User live location marker (Google Maps style pulsing blue beacon) */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={USER_LOCATION_ICON}
          >
            <Popup className="tree-popup">
              <div className="text-center py-2 px-3">
                <div className="text-xs font-semibold text-white flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span>Your Current Location</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">
                  {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Tree / plant markers as clean dot icons */}
        {trees.map((tree) => {
          const isSelected = selectedTreeId === tree.id;
          const varietyImages = getVarietyImageUrls(tree.variety_image_url);
          const plantImages = Array.isArray(tree.image_urls) ? tree.image_urls : [];
          const allImages = [...varietyImages, ...plantImages];

          return (
            <Marker
              key={tree.id}
              position={[tree.latitude, tree.longitude]}
              icon={getMarkerIcon(tree, isSelected)}
              eventHandlers={{
                click: () => {
                  setSelectedTreeId(tree.id);
                },
                popupclose: () => {
                  setSelectedTreeId((prev) => (prev === tree.id ? null : prev));
                },
              }}
            >
              <Popup
                maxWidth={320}
                minWidth={280}
                autoPan={true}
                autoPanPadding={[24, 24]}
                className="tree-popup"
              >
                <div className="space-y-2.5 p-3 select-none">
                  {/* Header: Tree ID */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0"
                        style={{ backgroundColor: getMarkerColor(tree) }}
                      />
                      <span className="font-bold text-sm text-white tracking-wide">
                        {tree.tree_id}
                      </span>
                    </div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      {tree.type}
                    </span>
                  </div>

                  {/* Location */}
                  {tree.farm_location && (
                    <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                      <span className="text-xs text-slate-300 font-medium">Location</span>
                      <span className="text-xs font-semibold text-white">
                        {tree.farm_location}
                      </span>
                    </div>
                  )}

                  {/* Is Fruiting */}
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                    <span className="text-xs text-slate-300 font-medium">Fruiting</span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                        tree.is_fruiting
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-slate-500/20 text-slate-400 border-slate-500/30"
                      }`}
                    >
                      {tree.is_fruiting ? "Yes" : "No"}
                    </span>
                  </div>

                  {/* Horizontal 1-at-a-time Scrollable Images */}
                  <TreeImageCarousel images={allImages} treeId={tree.tree_id} />
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
