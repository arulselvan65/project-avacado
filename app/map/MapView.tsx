"use client";

import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TreeRecord } from "@/lib/types";

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
  return (
    <MapContainer
      center={FARM_ENTRANCE}
      zoom={15}
      style={{ width: "100%", height: "100vh" }}
      zoomControl={true}
    >
      {/* OpenStreetMap tile layer — free, no API key needed */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
  );
}
