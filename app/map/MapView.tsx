"use client";

import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  LayersControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TreeRecord } from "@/lib/types";

// ─── Map Style / Tile Provider Configurations ──────────────────────────────

export type MapStyle = "google_hybrid" | "esri_satellite" | "google_satellite" | "osm";

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
  esri_satellite: {
    id: "esri_satellite",
    name: "Esri Satellite",
    badge: "🌎 Esri Earth",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community",
    maxZoom: 19,
  },
  google_satellite: {
    id: "google_satellite",
    name: "Pure Satellite",
    badge: "📷 Pure Sat",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps",
    maxZoom: 20,
  },
  osm: {
    id: "osm",
    name: "Street Map",
    badge: "🗺️ Street",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
};

// ─── Marker icon factories ──────────────────────────────────────────────────
//
// We use inline SVG divIcons so there are zero external image dependencies.
// Each marker is a colored pin shape rendered as an SVG data URI.

/**
 * Creates a Leaflet divIcon with a colored SVG map-pin.
 * @param color - fill color of the pin
 * @param size  - pixel size of the icon (default 32)
 */
function createColoredPinIcon(color: string, size = 32): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.5}">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
            fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="5" fill="#fff" opacity="0.9"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "", // disable default leaflet icon styles
    iconSize: [size, size * 1.5],
    iconAnchor: [size / 2, size * 1.5], // bottom-center of pin
    popupAnchor: [0, -(size * 1.5) + 4],
  });
}

/**
 * Creates a distinct "star" icon for the farm entrance marker
 * so it's visually different from tree/plant markers.
 */
function createFarmEntranceIcon(size = 36): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
               fill="#3b82f6" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

// Pre-create icon instances to avoid re-creating on every render
const ICON_GREEN = createColoredPinIcon("#22c55e");       // tree (not affected)
const ICON_LIGHT_GREEN = createColoredPinIcon("#86efac");  // plant (not affected)
const ICON_RED = createColoredPinIcon("#ef4444");           // affected
const ICON_FARM = createFarmEntranceIcon();

// TODO: Replace with real farm entrance coordinates
const FARM_ENTRANCE: [number, number] = [0, 0];

/**
 * Marker color logic:
 * 1. is_affected = true → red marker (highest priority, any affected tree/plant is red)
 * 2. type = "plant" → light green marker
 * 3. type = "tree" (not affected) → green marker
 */
function getMarkerIcon(record: TreeRecord): L.DivIcon {
  if (record.is_affected) return ICON_RED;
  if (record.type === "plant") return ICON_LIGHT_GREEN;
  return ICON_GREEN;
}

// ─── FitBounds component ─────────────────────────────────────────────────────
//
// This child component uses useMap() to fit the map bounds once data is loaded.
// We can't call useMap in the top-level component — it must be inside MapContainer.

function FitBounds({ trees }: { trees: TreeRecord[] }) {
  const map = useMap();

  useEffect(() => {
    // Build a bounds array including all tree markers + the farm entrance
    const points: L.LatLngExpression[] = [FARM_ENTRANCE];
    trees.forEach((t) => points.push([t.latitude, t.longitude]));

    if (trees.length > 0) {
      // Fit bounds to show all markers with some padding
      const bounds = L.latLngBounds(points as L.LatLngTuple[]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } else {
      // No tree records — center on the farm entrance at a reasonable zoom
      map.setView(FARM_ENTRANCE, 15);
    }
  }, [map, trees]);

  return null;
}

// ─── Main MapView component ──────────────────────────────────────────────────

interface MapViewProps {
  trees: TreeRecord[];
}

export default function MapView({ trees }: MapViewProps) {
  const [activeStyle, setActiveStyle] = useState<MapStyle>("google_hybrid");

  const currentProvider = TILE_PROVIDERS[activeStyle];

  return (
    <div className="relative w-full h-full">
      {/* Quick View Switcher Floating Toolbar */}
      <div
        className="fixed top-4 left-4 z-[1000] flex items-center gap-1.5 p-1.5 rounded-xl backdrop-blur-md shadow-lg transition-all"
        style={{
          background: "rgba(26, 29, 39, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
        }}
      >
        <span className="text-xs font-semibold px-2 text-gray-300 hidden sm:inline">
          View:
        </span>
        {(Object.keys(TILE_PROVIDERS) as MapStyle[]).map((key) => {
          const provider = TILE_PROVIDERS[key];
          const isActive = activeStyle === key;
          return (
            <button
              key={key}
              onClick={() => setActiveStyle(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                isActive
                  ? "bg-emerald-600 text-white shadow-md scale-105"
                  : "text-gray-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {provider.badge}
            </button>
          );
        })}
      </div>

      <MapContainer
        center={FARM_ENTRANCE}
        zoom={15}
        style={{ width: "100%", height: "100vh" }}
        zoomControl={true}
      >
        {/* Layer Control allowing standard Leaflet layer toggling */}
        <LayersControl position="topright">
          <LayersControl.BaseLayer
            checked={activeStyle === "google_hybrid"}
            name="Satellite Hybrid (Google)"
          >
            <TileLayer
              attribution={TILE_PROVIDERS.google_hybrid.attribution}
              url={TILE_PROVIDERS.google_hybrid.url}
              maxZoom={TILE_PROVIDERS.google_hybrid.maxZoom}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer
            checked={activeStyle === "esri_satellite"}
            name="Esri World Imagery (Satellite)"
          >
            <TileLayer
              attribution={TILE_PROVIDERS.esri_satellite.attribution}
              url={TILE_PROVIDERS.esri_satellite.url}
              maxZoom={TILE_PROVIDERS.esri_satellite.maxZoom}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer
            checked={activeStyle === "google_satellite"}
            name="Pure Satellite (Google)"
          >
            <TileLayer
              attribution={TILE_PROVIDERS.google_satellite.attribution}
              url={TILE_PROVIDERS.google_satellite.url}
              maxZoom={TILE_PROVIDERS.google_satellite.maxZoom}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer
            checked={activeStyle === "osm"}
            name="Standard Street Map (OpenStreetMap)"
          >
            <TileLayer
              attribution={TILE_PROVIDERS.osm.attribution}
              url={TILE_PROVIDERS.osm.url}
              maxZoom={TILE_PROVIDERS.osm.maxZoom}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* Dynamic active TileLayer synced with quick toolbar state */}
        <TileLayer
          key={activeStyle}
          attribution={currentProvider.attribution}
          url={currentProvider.url}
          maxZoom={currentProvider.maxZoom}
        />

        {/* Fit the map to include all markers once data loads */}
        <FitBounds trees={trees} />

        {/* Farm entrance marker — visually distinct blue star */}
        <Marker position={FARM_ENTRANCE} icon={ICON_FARM}>
          <Popup>
            <div className="text-center">
              <strong className="text-sm">🏠 Farm Entrance</strong>
              <p className="text-xs mt-1 opacity-60">Reference point</p>
            </div>
          </Popup>
        </Marker>

        {/* Tree / plant markers */}
        {trees.map((tree) => (
          <Marker
            key={tree.id}
            position={[tree.latitude, tree.longitude]}
            icon={getMarkerIcon(tree)}
          >
            <Popup maxWidth={280} minWidth={200}>
              <div className="space-y-1.5">
                <div className="font-bold text-sm">{tree.tree_id}</div>

                <div className="text-xs space-y-0.5">
                  <div>
                    <span className="opacity-60">Type:</span>{" "}
                    {tree.type === "tree" ? "🌳 Tree" : "🌿 Plant"}
                  </div>
                  {tree.variety && (
                    <div>
                      <span className="opacity-60">Variety:</span> {tree.variety}
                    </div>
                  )}
                  <div>
                    <span className="opacity-60">Fruiting:</span>{" "}
                    {tree.is_fruiting ? "✅ Yes" : "No"}
                  </div>
                  <div>
                    <span className="opacity-60">Affected:</span>{" "}
                    {tree.is_affected ? "⚠️ Yes" : "No"}
                  </div>
                  <div>
                    <span className="opacity-60">Pruned:</span>{" "}
                    {tree.is_pruned ? "✅ Yes" : "No"}
                  </div>
                </div>

                {/* Show the first photo, or the variety image as fallback */}
                {(tree.image_urls?.[0] || tree.variety_image_url) && (
                  <img
                    src={tree.image_urls?.[0] || tree.variety_image_url!}
                    alt={`${tree.tree_id} photo`}
                    className="w-full max-h-32 object-cover rounded-md mt-1"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

