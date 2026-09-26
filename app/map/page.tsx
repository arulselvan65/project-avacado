"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { TreeRecord } from "@/lib/types";

/**
 * Dynamic import of the MapView component with SSR disabled.
 * Leaflet requires `window` and `document`, so it cannot be rendered server-side.
 * The loading fallback is shown while the map component loads.
 */
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-screen flex items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      <div className="text-center space-y-3">
        <svg
          className="animate-spin h-8 w-8 mx-auto"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: "var(--primary)" }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-25"
          />
          <path
            d="M4 12a8 8 0 018-8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading map…
        </p>
      </div>
    </div>
  ),
});

export default function MapPage() {
  const [trees, setTrees] = useState<TreeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrees() {
      const { data, error: fetchError } = await supabase
        .from("trees")
        .select("*");

      if (fetchError) {
        setError(`Failed to load trees: ${fetchError.message}`);
        setLoading(false);
        return;
      }

      setTrees((data as TreeRecord[]) ?? []);
      setLoading(false);
    }

    fetchTrees();
  }, []);

  if (loading) {
    return (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <div className="text-center space-y-3">
          <svg
            className="animate-spin h-8 w-8 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: "var(--primary)" }}
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <path
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Fetching tree data…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full h-screen flex items-center justify-center px-6"
        style={{ background: "var(--background)" }}
      >
        <div
          className="max-w-md w-full px-6 py-5 rounded-xl border text-center"
          style={{
            background: "var(--error-bg)",
            borderColor: "var(--error-border)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Map fills the entire viewport */}
      <MapView trees={trees} />

      {/* Floating nav button — overlays the map */}
      <Link
        href="/register"
        className="fixed top-4 right-4 z-[1000] px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg backdrop-blur-md transition-all hover:scale-105"
        style={{
          background: "rgba(34, 197, 94, 0.9)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        ➕ Register New
      </Link>

      {/* Floating legend */}
      <div
        className="fixed bottom-6 left-4 z-[1000] px-4 py-3 rounded-xl text-xs space-y-1.5 backdrop-blur-md shadow-lg"
        style={{
          background: "rgba(26, 29, 39, 0.9)",
          border: "1px solid var(--card-border)",
          color: "var(--foreground)",
        }}
      >
        <div className="font-semibold text-sm mb-2" style={{ color: "var(--primary)" }}>
          Legend
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#22c55e" }} />
          Tree
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#86efac" }} />
          Plant
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
          Affected
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#3b82f6" }} />
          Farm Entrance
        </div>
      </div>
    </div>
  );
}
