"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { supabase } from "@/lib/supabase";
import type { ReviewMetadata } from "@/lib/reviewTypes";
import {
  getAllReviews,
  createNewReviewFromDatabase,
  deleteReviewRecord,
} from "@/lib/reviewStorage";

export default function ReviewsHistoryPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<ReviewMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Review Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newFarmLocation, setNewFarmLocation] = useState<string>("All");
  const [newTitle, setNewTitle] = useState("");
  const [dbTreeCount, setDbTreeCount] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Delete modal
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load reviews list
  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllReviews();
      setReviews(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load reviews";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Count trees in DB for selected location
  useEffect(() => {
    if (!showNewModal) return;
    async function countTrees() {
      let q = supabase.from("trees").select("*", { count: "exact", head: true });
      if (newFarmLocation !== "All") {
        q = q.eq("farm_location", newFarmLocation);
      }
      const { count } = await q;
      setDbTreeCount(count ?? 0);
    }
    countTrees();
  }, [showNewModal, newFarmLocation]);

  // Handle Create Review
  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError("");

    try {
      const newReview = await createNewReviewFromDatabase({
        title: newTitle.trim() || undefined,
        farm_location: newFarmLocation,
      });

      setShowNewModal(false);
      router.push(`/reviews/${newReview.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create review";
      setCreateError(msg);
      setCreating(false);
    }
  };

  // Handle Delete Review
  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      await deleteReviewRecord(deletingId);
      setReviews((prev) => prev.filter((r) => r.id !== deletingId));
      setDeletingId(null);
    } catch (err: unknown) {
      alert("Failed to delete review: " + (err instanceof Error ? err.message : ""));
    }
  };

  // Quick stats
  const totalReviews = reviews.length;
  const completedReviews = reviews.filter((r) => r.status === "completed").length;
  const inProgressReviews = reviews.filter((r) => r.status === "in_progress").length;
  const totalAffected = reviews.reduce((acc, r) => acc + (r.affected_count || 0), 0);

  return (
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden" style={{ background: "var(--bg-primary)" }}>
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm"
                style={{
                  background: "rgba(34, 197, 94, 0.15)",
                  border: "1px solid rgba(74, 222, 128, 0.35)",
                  color: "#4ade80",
                }}
              >
                <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
                Tree Review Tracking
              </h1>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Field inspection history, OK/Affected tracking records, and PDF defect reports
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadReviews}
              disabled={loading}
              className="p-2.5 rounded-xl border border-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 hover:bg-white/5 active:scale-95 transition-all"
              title="Refresh review records"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span className="hidden xs:inline">Refresh</span>
            </button>

            <button
              onClick={() => {
                setNewTitle("");
                setNewFarmLocation("All");
                setCreateError("");
                setShowNewModal(true);
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-md"
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
              <span>+ Start New Review</span>
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            className="p-4 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Total Reviews
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-zinc-100">
                {totalReviews}
              </span>
              <span className="text-xs text-zinc-500">Conducted</span>
            </div>
          </div>

          <div
            className="p-4 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Completed
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-emerald-400">
                {completedReviews}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
          </div>

          <div
            className="p-4 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              In Progress
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-amber-400">
                {inProgressReviews}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            </div>
          </div>

          <div
            className="p-4 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Affected Trees
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-red-400">
                {totalAffected}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Loading review history records…
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-center space-y-2">
            <p className="font-semibold text-xs text-red-300">{error}</p>
            <button
              onClick={loadReviews}
              className="px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && reviews.length === 0 && (
          <div
            className="py-16 px-4 rounded-2xl border text-center space-y-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-zinc-400">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-zinc-100">
                No reviews conducted yet
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Start a review cycle to inspect every tree in your farm, mark OK or Affected status, partially save as you go, and generate PDF defect reports.
              </p>
            </div>
            <button
              onClick={() => {
                setNewTitle("");
                setNewFarmLocation("All");
                setCreateError("");
                setShowNewModal(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg"
            >
              <span>+ Conduct First Review</span>
            </button>
          </div>
        )}

        {/* Reviews List */}
        {!loading && !error && reviews.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
              Previous Inspection Cycles ({reviews.length})
            </h2>

            <div className="space-y-3">
              {reviews.map((rev) => {
                const reviewedCount = (rev.ok_count || 0) + (rev.affected_count || 0);
                const progressPct =
                  rev.total_trees > 0
                    ? Math.round((reviewedCount / rev.total_trees) * 100)
                    : 0;

                const isCompleted = rev.status === "completed";

                return (
                  <div
                    key={rev.id}
                    className="p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:border-emerald-500/40"
                    style={{
                      background: "var(--bg-card)",
                      borderColor: "var(--border-secondary)",
                    }}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Info */}
                      <div className="flex-1 space-y-2.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold tracking-wide border"
                            style={{
                              background: "rgba(34, 197, 94, 0.12)",
                              borderColor: "rgba(74, 222, 128, 0.3)",
                              color: "#4ade80",
                            }}
                          >
                            {rev.id}
                          </span>

                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                              isCompleted
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isCompleted ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                              }`}
                            />
                            <span>{isCompleted ? "Completed" : "In Progress (Partial)"}</span>
                          </span>

                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold text-zinc-300 bg-white/5 border border-white/10">
                            {rev.farm_location || "All Farms"}
                          </span>

                          <span className="text-xs text-zinc-400 ml-auto flex items-center gap-1 font-mono">
                            <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{rev.review_date}</span>
                          </span>
                        </div>

                        <div>
                          <h3 className="font-bold text-sm sm:text-base text-zinc-100 truncate">
                            {rev.title}
                          </h3>
                        </div>

                        {/* Progress Bar & Breakdown */}
                        <div className="space-y-1.5 max-w-md">
                          <div className="flex items-center justify-between text-xs text-zinc-400">
                            <span>Review Progress: {reviewedCount} of {rev.total_trees} trees</span>
                            <span className="font-mono font-bold text-zinc-200">{progressPct}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{
                                width: `${rev.total_trees > 0 ? (rev.ok_count / rev.total_trees) * 100 : 0}%`,
                              }}
                              title={`OK: ${rev.ok_count}`}
                            />
                            <div
                              className="h-full bg-red-500 transition-all duration-300"
                              style={{
                                width: `${rev.total_trees > 0 ? (rev.affected_count / rev.total_trees) * 100 : 0}%`,
                              }}
                              title={`Affected: ${rev.affected_count}`}
                            />
                          </div>
                          <div className="flex items-center gap-4 text-[11px] text-zinc-400 pt-0.5">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              <strong className="text-zinc-200">{rev.ok_count || 0}</strong> OK
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-red-400" />
                              <strong className="text-zinc-200">{rev.affected_count || 0}</strong> Affected
                            </span>
                            {rev.unreviewed_count > 0 && (
                              <span className="flex items-center gap-1.5 text-zinc-500">
                                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                                <strong>{rev.unreviewed_count}</strong> Pending
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2.5 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-zinc-800">
                        {isCompleted ? (
                          <Link
                            href={`/reviews/${rev.id}/report`}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span>View Report & PDF</span>
                          </Link>
                        ) : (
                          <Link
                            href={`/reviews/${rev.id}`}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            <span>Resume Review</span>
                          </Link>
                        )}

                        <Link
                          href={`/reviews/${rev.id}`}
                          className="px-3 py-2 rounded-xl text-xs font-semibold border border-zinc-800 text-zinc-300 hover:bg-white/5 active:scale-95 transition-all"
                          title="View review record checklist"
                        >
                          Checklist
                        </Link>

                        <button
                          type="button"
                          onClick={() => setDeletingId(rev.id)}
                          className="p-2 rounded-xl text-xs border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 active:scale-95 transition-all"
                          title="Delete review record"
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

      {/* Start New Review Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div
            className="w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <h3 className="font-bold text-base text-zinc-100">Start New Tree Review</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Farm Location Filter
                </label>
                <select
                  value={newFarmLocation}
                  onChange={(e) => setNewFarmLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm focus:outline-none"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="All">All Farms (Entire Inventory)</option>
                  <option value="Attuvampatti">Attuvampatti Only</option>
                  <option value="Gundupatti">Gundupatti Only</option>
                </select>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {dbTreeCount !== null ? (
                    <span>
                      Found <strong className="text-emerald-400">{dbTreeCount}</strong> registered trees to review.
                    </span>
                  ) : (
                    "Loading tree count…"
                  )}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Review Title (Optional)
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`e.g. Field Inspection – ${newFarmLocation}`}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm focus:outline-none"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1 text-[11px] text-zinc-400">
                <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                  <span>Inspection Date:</span>
                  <span className="font-mono text-emerald-400">{new Date().toISOString().split("T")[0]} (Today)</span>
                </div>
                <p>
                  Tree IDs, locations, and photographs will be pulled directly from the main database without altering existing records.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  disabled={creating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-800 text-zinc-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || dbTreeCount === 0}
                  className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {creating ? "Creating Review…" : "Begin Inspection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="w-full max-w-sm p-5 rounded-2xl border shadow-2xl space-y-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <h3 className="font-bold text-sm text-zinc-100">Delete Review Record</h3>
            <p className="text-xs text-zinc-400">
              Are you sure you want to delete review <strong className="text-white font-mono">{deletingId}</strong>? This will permanently remove its tracking checklist and report data.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-800 text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
