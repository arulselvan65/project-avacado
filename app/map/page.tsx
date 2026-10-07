"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { TreeRecord } from "@/lib/types";
import Navbar from "../components/Navbar";

/**
 * Dynamic import of the MapView component with SSR disabled.
 * Leaflet requires `window` and `document`, so it cannot be rendered server-side.
 * The loading fallback is shown while the map component bundles initialize.
 */
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="text-center space-y-3">
        <svg
          className="animate-spin h-8 w-8 mx-auto"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: "var(--accent)" }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-20"
          />
          <path
            d="M4 12a8 8 0 018-8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "var(--text-tertiary)" }}>
          Initializing Map
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

  return (
    <div className="relative w-full h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* Universal Navbar */}
      <Navbar />

      {/* Map View Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <MapView trees={trees} />

      {/* Floating Status Pill when fetching markers in background */}
      {loading && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md transition-all animate-pulse"
          style={{
            background: "rgba(17, 20, 27, 0.85)",
            border: "1px solid var(--border-secondary)",
            color: "var(--text-secondary)",
          }}
        >
          <svg
            className="animate-spin h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: "var(--accent)" }}
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
          <span className="text-xs font-medium">Syncing tree records…</span>
        </div>
      )}

      {/* Non-intrusive floating error toast */}
      {error && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md"
          style={{
            background: "rgba(22, 10, 12, 0.95)",
            border: "1px solid var(--danger)",
            color: "var(--text-primary)",
          }}
        >
          <svg className="w-4 h-4 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-xs font-medium text-red-200">{error}</span>
          <button
            onClick={() => window.location.reload()}
            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Floating map legend */}
      <div
        className="fixed bottom-6 left-4 z-[1000] px-3.5 py-3 rounded-xl text-xs space-y-2 backdrop-blur-md shadow-xl"
        style={{
          background: "rgba(17, 20, 27, 0.88)",
          border: "1px solid var(--border-secondary)",
          color: "var(--text-secondary)",
        }}
      >
        <div
          className="font-semibold text-[11px] tracking-wider uppercase"
          style={{ color: "var(--text-tertiary)" }}
        >
          Legend
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shadow-sm"
            style={{ background: "#22c55e", boxShadow: "0 0 6px rgba(34, 197, 94, 0.4)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-primary)" }}>Tree</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shadow-sm"
            style={{ background: "#86efac", boxShadow: "0 0 6px rgba(134, 239, 172, 0.4)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-primary)" }}>Plant</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shadow-sm"
            style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239, 68, 68, 0.4)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-primary)" }}>Affected</span>
        </div>
        <div
          className="flex items-center gap-2.5 pt-1.5 border-t"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shadow-sm"
            style={{ background: "#3a7bd5", boxShadow: "0 0 6px rgba(58, 123, 213, 0.6)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-primary)" }}>You (GPS)</span>
        </div>
      </div>
      </div>
    </div>
  );
}
