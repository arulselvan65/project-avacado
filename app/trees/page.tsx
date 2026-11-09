"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Navbar from "../components/Navbar";
import TreeEditModal from "./TreeEditModal";
import { supabase } from "@/lib/supabase";
import type { TreeRecord } from "@/lib/types";
import { getVarietyImageUrls } from "@/lib/types";

// Dynamic import of navigation modal to disable SSR (Leaflet requires browser window/document)
const NavigateToTreeModal = dynamic(
  () => import("./NavigateToTreeModal"),
  { ssr: false }
);

export default function TreesListPage() {
  const [trees, setTrees] = useState<TreeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filter, and sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<"ALL" | "Attuvampatti" | "Gundupatti">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "tree" | "plant" | "regrown" | "dead">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "fruiting" | "affected" | "pruned">("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "id_asc" | "id_desc">("newest");

  // Navigation Modal state
  const [navigatingTree, setNavigatingTree] = useState<TreeRecord | null>(null);

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

  // Read URL query parameter if present (e.g. ?search=A-001 or ?id=A-001)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const search = params.get("search") || params.get("id");
      if (search) {
        setSearchQuery(search);
      }
    }
  }, []);

  // Statistics
  const stats = useMemo(() => {
    const total = trees.length;
    const treeCount = trees.filter((t) => t.type === "tree").length;
    const plantCount = trees.filter((t) => t.type === "plant").length;
    const regrownCount = trees.filter((t) => t.type === "regrown").length;
    const deadCount = trees.filter((t) => t.type === "dead").length;
    const fruitingCount = trees.filter((t) => t.is_fruiting).length;
    const affectedCount = trees.filter((t) => t.is_affected).length;
    const prunedCount = trees.filter((t) => t.is_pruned).length;
    const attuvampattiCount = trees.filter((t) => t.farm_location === "Attuvampatti").length;
    const gundupattiCount = trees.filter((t) => t.farm_location === "Gundupatti").length;

    return {
      total,
      treeCount,
      plantCount,
      regrownCount,
      deadCount,
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

        if (locationFilter !== "ALL") {
          if (t.farm_location !== locationFilter) return false;
        }

        if (typeFilter !== "ALL") {
          if (t.type !== typeFilter) return false;
        }

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
      const message = err instanceof Error ? err.message : "Failed to delete record";
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
  };

  return (
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden" style={{ background: "var(--bg-primary)" }}>
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">
        {/* Header Title & Register Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-100">
                Registered Inventory
              </h1>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Field inventory and location records for Mages Farms
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchTrees}
              disabled={loading}
              className="p-2.5 rounded-xl border border-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 hover:bg-white/5 active:scale-95 transition-all"
              title="Refresh inventory records"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span className="hidden xs:inline">Sync</span>
            </button>

            <Link
              href="/register"
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shadow-md"
              style={{
                background: "var(--accent)",
                color: "#ffffff",
                boxShadow: "0 4px 15px rgba(22, 163, 74, 0.35)",
              }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Register Tree</span>
            </Link>
          </div>
        </div>

        {/* Professional Metrics Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Total Records
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-zinc-100">
                {stats.total}
              </span>
              <span className="text-[10px] font-semibold text-zinc-500">
                {stats.treeCount}T / {stats.plantCount}P
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Attuvampatti
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-emerald-400">
                {stats.attuvampattiCount}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Gundupatti
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-teal-400">
                {stats.gundupattiCount}
              </span>
              <span className="w-2 h-2 rounded-full bg-teal-400" />
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Fruiting Active
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-emerald-300">
                {stats.fruitingCount}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Affected Flags
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-red-400">
                {stats.affectedCount}
              </span>
              <span className="w-2 h-2 rounded-full bg-red-400" />
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Pruned Status
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-amber-400">
                {stats.prunedCount}
              </span>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div
          className="p-3.5 sm:p-4 rounded-2xl border space-y-3"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-secondary)",
          }}
        >
          {/* Search Input & Sort */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <svg
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
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
                placeholder="Search Tree ID, Variety, Note, Location…"
                className="w-full pl-10 pr-4 py-2 rounded-xl border text-xs sm:text-sm focus:outline-none transition-all"
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
              <span className="text-xs font-semibold text-zinc-500 shrink-0">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-2 rounded-xl border text-xs font-semibold focus:outline-none"
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
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2 border-t" style={{ borderColor: "var(--border-primary)" }}>
            {/* Location Filters */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
                Location:
              </span>
              {(["ALL", "Attuvampatti", "Gundupatti"] as const).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocationFilter(loc)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    locationFilter === loc
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {loc === "ALL" ? "All Locations" : loc}
                </button>
              ))}
            </div>

            <div className="h-3.5 w-px bg-zinc-800 hidden sm:block mx-1" />

            {/* Type Filters */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
                Type:
              </span>
              {(["ALL", "tree", "plant", "regrown", "dead"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    typeFilter === t
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {t === "ALL" ? "All Types" : t}
                </button>
              ))}
            </div>

            <div className="h-3.5 w-px bg-zinc-800 hidden sm:block mx-1" />

            {/* Status Filters */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
                Status:
              </span>
              {(["ALL", "fruiting", "affected", "pruned"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    statusFilter === st
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {st === "ALL" ? "All" : st === "fruiting" ? "Fruiting" : st === "affected" ? "Affected" : "Pruned"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <div className="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Loading inventory records…
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="p-5 rounded-2xl border border-red-500/30 bg-red-500/10 text-center space-y-3">
            <p className="font-semibold text-xs text-red-300">Failed to load records: {error}</p>
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
            className="py-14 px-4 rounded-2xl border text-center space-y-3"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-800 mx-auto flex items-center justify-center text-zinc-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3 className="font-bold text-sm text-zinc-100">
              No matching records found
            </h3>
            <p className="text-xs max-w-md mx-auto text-zinc-400">
              {searchQuery || locationFilter !== "ALL" || typeFilter !== "ALL" || statusFilter !== "ALL"
                ? "No trees match the current filter or search criteria. Try adjusting your parameters."
                : "No trees or plants have been registered yet."}
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider mt-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
            >
              <span>+ Register New Tree</span>
            </Link>
          </div>
        )}

        {/* Line-by-Line Tree Records List */}
        {!loading && !error && filteredTrees.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs px-1 text-zinc-400">
              <span>
                Showing <strong className="text-zinc-100">{filteredTrees.length}</strong> of{" "}
                <strong>{trees.length}</strong> records
              </span>
            </div>

            <div className="space-y-2.5">
              {filteredTrees.map((tree) => {
                const varietyUrls = getVarietyImageUrls(tree.variety_image_url);
                const photos = tree.image_urls || [];
                const allPhotos = [...photos, ...varietyUrls];

                return (
                  <div
                    key={tree.id}
                    className="p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 hover:border-emerald-500/40"
                    style={{
                      background: "var(--bg-card)",
                      borderColor: "var(--border-secondary)",
                    }}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                      {/* Left: Details */}
                      <div className="flex-1 space-y-2 min-w-0">
                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span
                            className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold tracking-wide border"
                            style={{
                              background: "rgba(34, 197, 94, 0.12)",
                              borderColor: "rgba(74, 222, 128, 0.3)",
                              color: "#4ade80",
                            }}
                          >
                            {tree.tree_id || "UNTAGGED"}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider capitalize ${
                              tree.type === "plant"
                                ? "bg-teal-950/80 text-teal-300 border border-teal-800/60"
                                : tree.type === "regrown"
                                ? "bg-yellow-950/80 text-yellow-300 border border-yellow-800/60"
                                : tree.type === "dead"
                                ? "bg-stone-900 text-stone-400 border border-stone-700/60"
                                : "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60"
                            }`}
                          >
                            {tree.type}
                          </span>

                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-zinc-300 bg-white/5 border border-white/10">
                            {tree.farm_location || "Attuvampatti"}
                          </span>

                          {/* Status Flags */}
                          {tree.is_fruiting && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span>Fruiting</span>
                            </span>
                          )}

                          {tree.is_affected && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                              <span>Affected</span>
                            </span>
                          )}

                          {tree.is_pruned && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              <span>Pruned</span>
                            </span>
                          )}

                          {tree.created_at && (
                            <span className="text-[10px] ml-auto text-zinc-500 hidden sm:inline">
                              {new Date(tree.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </div>

                        {/* Variety & Location info */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          {tree.variety && (
                            <div className="flex items-center gap-1">
                              <span className="text-zinc-500 text-[10px] font-semibold uppercase">Variety:</span>
                              <span className="font-semibold text-zinc-200">{tree.variety}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1">
                            <span className="text-zinc-500 text-[10px] font-semibold uppercase">GPS:</span>
                            <button
                              onClick={() => copyCoordinates(tree.latitude, tree.longitude)}
                              className="font-mono text-zinc-300 hover:text-emerald-400 transition-colors text-xs"
                              title="Click to copy coordinates"
                            >
                              {tree.latitude?.toFixed(6)}, {tree.longitude?.toFixed(6)}
                            </button>
                          </div>
                        </div>

                        {/* Note */}
                        {tree.note && (
                          <p className="text-xs text-zinc-400 bg-white/[0.02] px-2.5 py-1.5 rounded-lg border border-white/5 truncate">
                            {tree.note}
                          </p>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800 flex-wrap">
                        {/* Navigate to Tree */}
                        <button
                          type="button"
                          onClick={() => setNavigatingTree(tree)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500 hover:text-white active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
                          title="Navigate to this tree on live map"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polygon points="3 11 22 2 13 21 11 13 3 11" />
                          </svg>
                          <span>Navigate</span>
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => setEditingTree(tree)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-700 bg-white/[0.02] text-zinc-200 hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:text-emerald-300 active:scale-95 transition-all flex items-center gap-1.5"
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
                          className="p-2 rounded-xl text-xs border border-zinc-800 text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
                          title="Open Map View"
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
                          className="p-2 rounded-xl text-xs border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 active:scale-95 transition-all"
                          title="Delete record"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Multiple Photos Gallery at bottom across all sides, not centered */}
                    {allPhotos.length > 0 && (
                      <div className="-mx-3.5 sm:-mx-4 -mb-3.5 sm:-mb-4 mt-3 border-t border-zinc-800/80 bg-black/25 rounded-b-2xl overflow-hidden p-2.5 sm:p-3">
                        <div className="flex items-center justify-between mb-2 px-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span>Photos ({allPhotos.length})</span>
                          </span>
                          <span className="text-[10px] text-zinc-500">Tap photo to enlarge</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                          {allPhotos.map((url, imgIdx) => (
                            <button
                              key={imgIdx}
                              type="button"
                              onClick={() => openLightbox(allPhotos, imgIdx)}
                              className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-zinc-700/60 hover:border-emerald-400 bg-zinc-900 transition-all hover:scale-[1.02] active:scale-95 text-left"
                              title={`View photo ${imgIdx + 1}`}
                            >
                              <img
                                src={url}
                                alt={`${tree.tree_id} photo ${imgIdx + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/80 text-white/90 backdrop-blur-xs">
                                #{imgIdx + 1}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
            className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-100">Delete Tree Record</h3>
                <p className="text-xs text-zinc-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Confirm deletion of tree record{" "}
              <strong className="text-white font-mono">{deletingTree.tree_id}</strong> (
              {deletingTree.farm_location || "Attuvampatti"}).
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
                {isDeleting ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal with separate exit button & navigation */}
      {lightboxImages.length > 0 && (
        <div className="fixed inset-0 z-[1400] flex flex-col items-center justify-between p-4 bg-black/95 backdrop-blur-xl">
          <div className="w-full max-w-4xl flex items-center justify-between py-2 shrink-0">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Photo {lightboxIndex + 1} of {lightboxImages.length}
            </span>

            <button
              type="button"
              onClick={() => setLightboxImages([])}
              className="px-3.5 py-1.5 rounded-xl border border-zinc-700 bg-zinc-900/80 hover:bg-red-600 hover:border-red-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-lg"
              title="Close Fullscreen View"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>Exit</span>
            </button>
          </div>

          <div className="relative flex-1 w-full max-w-4xl flex items-center justify-center overflow-hidden my-auto">
            <img
              src={lightboxImages[lightboxIndex]}
              alt={`Full view ${lightboxIndex + 1}`}
              className="max-h-[78vh] max-w-full object-contain rounded-xl shadow-2xl"
            />

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

          {lightboxImages.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto py-2 max-w-full shrink-0">
              {lightboxImages.map((src, idx) => (
                <button
                  key={idx}
                  onClick={() => setLightboxIndex(idx)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                    idx === lightboxIndex
                      ? "border-emerald-400 scale-105"
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

      {/* Navigate to Tree Live Map Modal */}
      <NavigateToTreeModal
        isOpen={navigatingTree !== null}
        tree={navigatingTree}
        onClose={() => setNavigatingTree(null)}
      />
    </div>
  );
}
