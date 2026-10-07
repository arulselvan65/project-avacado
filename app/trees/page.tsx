"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import TreeEditModal from "./TreeEditModal";
import { supabase } from "@/lib/supabase";
import type { TreeRecord } from "@/lib/types";
import { getVarietyImageUrls } from "@/lib/types";

export default function TreesListPage() {
  const [trees, setTrees] = useState<TreeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filter, and sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<"ALL" | "Attuvampatti" | "Gundupatti">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "tree" | "plant">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "fruiting" | "affected" | "pruned">("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "id_asc" | "id_desc">("newest");

  // Edit Modal state
  const [editingTree, setEditingTree] = useState<TreeRecord | null>(null);

  // Delete confirmation modal state
  const [deletingTree, setDeletingTree] = useState<TreeRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fullscreen Image Lightbox state
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Fetch trees from Supabase
  const fetchTrees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("trees")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setTrees((data as TreeRecord[]) || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load trees";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrees();
  }, [fetchTrees]);

  // Statistics
  const stats = useMemo(() => {
    const total = trees.length;
    const treeCount = trees.filter((t) => t.type === "tree").length;
    const plantCount = trees.filter((t) => t.type === "plant").length;
    const fruitingCount = trees.filter((t) => t.is_fruiting).length;
    const affectedCount = trees.filter((t) => t.is_affected).length;
    const prunedCount = trees.filter((t) => t.is_pruned).length;
    const attuvampattiCount = trees.filter((t) => t.farm_location === "Attuvampatti").length;
    const gundupattiCount = trees.filter((t) => t.farm_location === "Gundupatti").length;

    return {
      total,
      treeCount,
      plantCount,
      fruitingCount,
      affectedCount,
      prunedCount,
      attuvampattiCount,
      gundupattiCount,
    };
  }, [trees]);

  // Filtered & Sorted trees
  const filteredTrees = useMemo(() => {
    return trees
      .filter((t) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchId = t.tree_id?.toLowerCase().includes(q);
          const matchVariety = t.variety?.toLowerCase().includes(q);
          const matchNote = t.note?.toLowerCase().includes(q);
          const matchLoc = t.farm_location?.toLowerCase().includes(q);
          if (!matchId && !matchVariety && !matchNote && !matchLoc) {
            return false;
          }
        }

        // Location filter
        if (locationFilter !== "ALL") {
          if (t.farm_location !== locationFilter) return false;
        }

        // Type filter
        if (typeFilter !== "ALL") {
          if (t.type !== typeFilter) return false;
        }

        // Status filter
        if (statusFilter === "fruiting" && !t.is_fruiting) return false;
        if (statusFilter === "affected" && !t.is_affected) return false;
        if (statusFilter === "pruned" && !t.is_pruned) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortBy === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortBy === "id_asc") {
          return (a.tree_id || "").localeCompare(b.tree_id || "");
        }
        if (sortBy === "id_desc") {
          return (b.tree_id || "").localeCompare(a.tree_id || "");
        }
        return 0;
      });
  }, [trees, searchQuery, locationFilter, typeFilter, statusFilter, sortBy]);

  // Handle tree updated from Edit Modal
  const handleTreeSaved = (updated: TreeRecord) => {
    setTrees((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  // Delete Tree Handler
  const handleDeleteConfirm = async () => {
    if (!deletingTree) return;
    setIsDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from("trees")
        .delete()
        .eq("id", deletingTree.id);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      setTrees((prev) => prev.filter((t) => t.id !== deletingTree.id));
      setDeletingTree(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      alert(message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Lightbox
  const openLightbox = (images: string[], startIndex: number = 0) => {
    if (images.length === 0) return;
    setLightboxImages(images);
    setLightboxIndex(startIndex);
  };

  const copyCoordinates = (lat: number, lng: number) => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    alert(`Copied coordinates to clipboard:\n${text}`);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 space-y-6">
        {/* Header Title & Register Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📋</span>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
                Registered Tree Records
              </h1>
            </div>
            <p className="text-xs sm:text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Manage, search, and edit tree details, varieties, photos, and GPS coordinates line-by-line.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchTrees}
              disabled={loading}
              className="p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all hover:bg-white/5 active:scale-95"
              style={{
                borderColor: "var(--border-secondary)",
                color: "var(--text-secondary)",
              }}
              title="Refresh tree list"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin text-green-400" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span className="hidden xs:inline">Refresh</span>
            </button>

            <Link
              href="/register"
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg"
              style={{
                background: "var(--accent)",
                color: "#ffffff",
                boxShadow: "0 4px 15px rgba(22, 163, 74, 0.35)",
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Register Tree</span>
            </Link>
          </div>
        </div>

        {/* Stats Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Total Plants
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>
                {stats.total}
              </span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
                100%
              </span>
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Attuvampatti
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-emerald-400">
                {stats.attuvampattiCount}
              </span>
              <span className="text-xs">🏡</span>
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Gundupatti
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-teal-400">
                {stats.gundupattiCount}
              </span>
              <span className="text-xs">🏞️</span>
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Fruiting
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-emerald-300">
                {stats.fruitingCount}
              </span>
              <span className="text-xs">🍋</span>
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Affected
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-red-400">
                {stats.affectedCount}
              </span>
              <span className="text-xs">⚠️</span>
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Pruned
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-amber-400">
                {stats.prunedCount}
              </span>
              <span className="text-xs">✂️</span>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div
          className="p-4 rounded-2xl border space-y-3.5"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-secondary)",
          }}
        >
          {/* Search Input & Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Tree ID, Variety, Notes, or Location…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none transition-all"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400 shrink-0">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="id_asc">Tree ID (A → Z)</option>
                <option value="id_desc">Tree ID (Z → A)</option>
              </select>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t" style={{ borderColor: "var(--border-primary)" }}>
            {/* Location Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
                Location:
              </span>
              {(["ALL", "Attuvampatti", "Gundupatti"] as const).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocationFilter(loc)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    locationFilter === loc
                      ? "bg-emerald-500 text-white font-bold shadow-sm"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {loc === "ALL" ? "All Locations" : loc}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-zinc-800 hidden sm:block mx-1" />

            {/* Type Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
                Type:
              </span>
              {(["ALL", "tree", "plant"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    typeFilter === t
                      ? "bg-emerald-500 text-white font-bold shadow-sm"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {t === "ALL" ? "All Types" : t === "tree" ? "🌳 Trees" : "🌱 Plants"}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-zinc-800 hidden sm:block mx-1" />

            {/* Status Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
                Status:
              </span>
              {(["ALL", "fruiting", "affected", "pruned"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === st
                      ? "bg-emerald-500 text-white font-bold shadow-sm"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {st === "ALL" ? "All Statuses" : st === "fruiting" ? "🍋 Fruiting" : st === "affected" ? "⚠️ Affected" : "✂️ Pruned"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Loading tree records from database…
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div
            className="p-5 rounded-2xl border text-center space-y-3"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              borderColor: "rgba(239, 68, 68, 0.3)",
              color: "#f87171",
            }}
          >
            <p className="font-semibold text-sm">Failed to load trees: {error}</p>
            <button
              onClick={fetchTrees}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredTrees.length === 0 && (
          <div
            className="py-16 px-4 rounded-2xl border text-center space-y-3"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-4xl">🌱</span>
            <h3 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
              No trees or plants found
            </h3>
            <p className="text-xs max-w-md mx-auto" style={{ color: "var(--text-tertiary)" }}>
              {searchQuery || locationFilter !== "ALL" || typeFilter !== "ALL" || statusFilter !== "ALL"
                ? "No records match the current filter or search criteria. Try adjusting your filters."
                : "No tree records have been registered yet. Click below to register your first tree."}
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider mt-2 transition-transform hover:scale-105"
              style={{
                background: "var(--accent)",
                color: "#ffffff",
              }}
            >
              <span>+ Register New Tree</span>
            </Link>
          </div>
        )}

        {/* Line-by-Line Tree Records List */}
        {!loading && !error && filteredTrees.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
              <span>
                Showing <strong style={{ color: "var(--text-primary)" }}>{filteredTrees.length}</strong> of{" "}
                <strong>{trees.length}</strong> registered records
              </span>
            </div>

            <div className="space-y-3">
              {filteredTrees.map((tree) => {
                const varietyUrls = getVarietyImageUrls(tree.variety_image_url);
                const photos = tree.image_urls || [];
                const allPhotos = [...photos, ...varietyUrls];

                return (
                  <div
                    key={tree.id}
                    className="p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:border-green-500/40 group"
                    style={{
                      background: "var(--bg-card)",
                      borderColor: "var(--border-secondary)",
                    }}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Identifiers & Details */}
                      <div className="flex-1 space-y-2.5">
                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wide border"
                            style={{
                              background: "rgba(34, 197, 94, 0.15)",
                              borderColor: "rgba(74, 222, 128, 0.4)",
                              color: "#4ade80",
                            }}
                          >
                            {tree.tree_id || "NO-TAG"}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider ${
                              tree.type === "plant"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800/60"
                                : "bg-green-950 text-green-300 border border-green-800/60"
                            }`}
                          >
                            {tree.type === "plant" ? "🌱 Plant" : "🌳 Tree"}
                          </span>

                          <span
                            className="px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border"
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              borderColor: "var(--border-primary)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            📍 {tree.farm_location || "Attuvampatti"}
                          </span>

                          {/* Status Flags */}
                          {tree.is_fruiting && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              🍋 Fruiting
                            </span>
                          )}

                          {tree.is_affected && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
                              ⚠️ Affected
                            </span>
                          )}

                          {tree.is_pruned && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              ✂️ Pruned
                            </span>
                          )}

                          {tree.created_at && (
                            <span className="text-[11px] ml-auto text-zinc-500 hidden sm:inline">
                              {new Date(tree.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </div>

                        {/* Variety & Notes */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          {tree.variety && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-500 uppercase text-[10px] font-semibold">Variety:</span>
                              <span className="font-semibold text-zinc-200">{tree.variety}</span>
                            </div>
                          )}

                          {/* GPS Coordinates with copy */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500 uppercase text-[10px] font-semibold">GPS:</span>
                            <button
                              onClick={() => copyCoordinates(tree.latitude, tree.longitude)}
                              className="font-mono text-zinc-300 hover:text-green-400 underline decoration-dotted decoration-zinc-600 transition-colors"
                              title="Click to copy GPS coordinates"
                            >
                              {tree.latitude?.toFixed(6)}, {tree.longitude?.toFixed(6)}
                            </button>
                          </div>
                        </div>

                        {/* Note text */}
                        {tree.note && (
                          <p className="text-xs text-zinc-400 bg-white/[0.02] p-2 rounded-lg border border-white/5 italic">
                            &ldquo;{tree.note}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Middle: Photos gallery thumbnails */}
                      {allPhotos.length > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto py-1">
                          {allPhotos.slice(0, 4).map((url, imgIdx) => (
                            <button
                              key={imgIdx}
                              onClick={() => openLightbox(allPhotos, imgIdx)}
                              className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl border border-zinc-700/60 overflow-hidden hover:scale-105 active:scale-95 transition-transform group/img"
                              title="Click to view full image"
                            >
                              <img src={url} alt={`Photo ${imgIdx}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="11" cy="11" r="8" />
                                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                  <line x1="11" y1="8" x2="11" y2="14" />
                                  <line x1="8" y1="11" x2="14" y2="11" />
                                </svg>
                              </div>
                            </button>
                          ))}
                          {allPhotos.length > 4 && (
                            <button
                              onClick={() => openLightbox(allPhotos, 4)}
                              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border border-zinc-700/60 bg-zinc-900 flex items-center justify-center text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                              +{allPhotos.length - 4}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800">
                        {/* Edit Button */}
                        <button
                          onClick={() => setEditingTree(tree)}
                          className="px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:text-emerald-300 active:scale-95"
                          style={{
                            background: "rgba(255, 255, 255, 0.03)",
                            borderColor: "var(--border-primary)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <span>Edit</span>
                        </button>

                        {/* View on Map */}
                        <Link
                          href="/map"
                          className="p-2 rounded-xl text-xs font-semibold border flex items-center justify-center transition-all hover:bg-white/10 hover:text-white active:scale-95"
                          style={{
                            borderColor: "var(--border-primary)",
                            color: "var(--text-secondary)",
                          }}
                          title="View on Map"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                            <line x1="8" y1="2" x2="8" y2="18" />
                            <line x1="16" y1="6" x2="16" y2="22" />
                          </svg>
                        </Link>

                        {/* Delete Button */}
                        <button
                          onClick={() => setDeletingTree(tree)}
                          className="p-2 rounded-xl text-xs font-semibold border flex items-center justify-center transition-all hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400 active:scale-95"
                          style={{
                            borderColor: "var(--border-primary)",
                            color: "var(--text-tertiary)",
                          }}
                          title="Delete tree record"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Edit Tree Modal */}
      <TreeEditModal
        isOpen={editingTree !== null}
        tree={editingTree}
        onClose={() => setEditingTree(null)}
        onSaved={handleTreeSaved}
      />

      {/* Delete Confirmation Modal */}
      {deletingTree && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xl">
                ⚠️
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-100">Delete Tree Record</h3>
                <p className="text-xs text-zinc-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to delete tree{" "}
              <strong className="text-white font-mono">{deletingTree.tree_id}</strong> (
              {deletingTree.farm_location || "Attuvampatti"})? This will permanently remove the record from the database.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTree(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-800 text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white transition-all active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal with separate exit button & navigation */}
      {lightboxImages.length > 0 && (
        <div className="fixed inset-0 z-[1400] flex flex-col items-center justify-between p-4 bg-black/95 backdrop-blur-xl">
          {/* Top Bar with Clear Separate Exit Button */}
          <div className="w-full max-w-4xl flex items-center justify-between py-2 shrink-0">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Image {lightboxIndex + 1} of {lightboxImages.length}
            </span>

            <button
              type="button"
              onClick={() => setLightboxImages([])}
              className="px-3.5 py-1.5 rounded-xl border border-zinc-700 bg-zinc-900/80 hover:bg-red-600 hover:border-red-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-lg"
              title="Close Full Image Viewer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>Exit</span>
            </button>
          </div>

          {/* Main Image View */}
          <div className="relative flex-1 w-full max-w-4xl flex items-center justify-center overflow-hidden my-auto">
            <img
              src={lightboxImages[lightboxIndex]}
              alt={`Full view ${lightboxIndex + 1}`}
              className="max-h-[78vh] max-w-full object-contain rounded-xl shadow-2xl"
            />

            {/* Prev Button */}
            {lightboxImages.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev === 0 ? lightboxImages.length - 1 : prev - 1
                  )
                }
                className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 border border-zinc-700 text-white hover:bg-white/20 transition-all"
                title="Previous image"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}

            {/* Next Button */}
            {lightboxImages.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev === lightboxImages.length - 1 ? 0 : prev + 1
                  )
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 border border-zinc-700 text-white hover:bg-white/20 transition-all"
                title="Next image"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom Thumbnails */}
          {lightboxImages.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto py-2 max-w-full shrink-0">
              {lightboxImages.map((src, idx) => (
                <button
                  key={idx}
                  onClick={() => setLightboxIndex(idx)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                    idx === lightboxIndex
                      ? "border-green-400 scale-105"
                      : "border-zinc-800 opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={src} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
