"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Navbar from "@/app/components/Navbar";
import {
  type TreeReviewRecord,
  type TreeReviewItem,
  getAffectedPhotoUrls,
} from "@/lib/reviewTypes";
import { getReviewById } from "@/lib/reviewStorage";
import { downloadAffectedTreesPdf } from "@/lib/generatePdfReport";

// Dynamic import for Leaflet mini map (SSR disabled)
const LocationPickerMap = dynamic(
  () => import("@/app/register/LocationPickerMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-44 rounded-xl flex items-center justify-center bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
        Loading map preview…
      </div>
    ),
  }
);

export default function ReviewReportPage() {
  const params = useParams();
  const reviewId = params?.id as string;

  const [review, setReview] = useState<TreeReviewRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF downloading state
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfStatusMsg, setPdfStatusMsg] = useState("");

  // Load review
  const loadReview = useCallback(async () => {
    if (!reviewId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getReviewById(reviewId);
      if (!data) throw new Error(`Review record "${reviewId}" was not found.`);
      setReview(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load review report";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  // Handle PDF Download
  const handleDownloadPdf = async () => {
    if (!review) return;
    setGeneratingPdf(true);
    setPdfStatusMsg("Preparing document…");
    try {
      await downloadAffectedTreesPdf(review, (msg) => {
        setPdfStatusMsg(msg);
      });
    } catch (err) {
      alert("Failed to generate PDF: " + (err instanceof Error ? err.message : ""));
    } finally {
      setGeneratingPdf(false);
      setPdfStatusMsg("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Generating Affected Trees Report…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
        <Navbar />
        <div className="flex-1 max-w-lg mx-auto p-6 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
            ✕
          </div>
          <h2 className="text-base font-bold text-zinc-100">Report Not Available</h2>
          <p className="text-xs text-zinc-400">{error || "Could not load report data."}</p>
          <Link
            href="/reviews"
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-zinc-800 text-zinc-200"
          >
            ← Back to Reviews History
          </Link>
        </div>
      </div>
    );
  }

  const affectedTrees = review.items.filter((i) => i.status === "affected");

  return (
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden" style={{ background: "var(--bg-primary)" }}>
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Breadcrumb & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Link href="/reviews" className="hover:text-emerald-400">
                Reviews
              </Link>
              <span>/</span>
              <Link href={`/reviews/${review.id}`} className="hover:text-emerald-400 font-mono">
                {review.id}
              </Link>
              <span>/</span>
              <span className="text-zinc-200 font-semibold">Affected Trees Report</span>
            </div>

            <div className="flex items-center gap-3 mt-1.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
                Inspection Report: Affected Trees
              </h1>
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30">
                {affectedTrees.length} Flagged
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Review cycle conducted on <strong className="text-zinc-200 font-mono">{review.review_date}</strong> ({review.title})
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Checklist View Button */}
            <Link
              href={`/reviews/${review.id}`}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-700 bg-white/5 text-zinc-300 hover:bg-white/10 active:scale-95 transition-all"
            >
              Full Checklist
            </Link>

            {/* Print Button */}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-700 bg-white/5 text-zinc-300 hover:bg-white/10 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print</span>
            </button>

            {/* Download PDF Button (Requirement 4 & User Request) */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white transition-all flex items-center gap-2 shadow-lg shadow-red-600/30 active:scale-95 disabled:opacity-60"
            >
              {generatingPdf ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <span>{generatingPdf ? pdfStatusMsg || "Building PDF…" : "Download PDF"}</span>
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
              Total Inspected
            </span>
            <span className="text-2xl font-extrabold text-zinc-100 mt-2">
              {review.total_trees}
            </span>
          </div>

          <div
            className="p-4 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Healthy (OK)
            </span>
            <span className="text-2xl font-extrabold text-emerald-400 mt-2">
              {review.ok_count}
            </span>
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
            <span className="text-2xl font-extrabold text-red-400 mt-2">
              {affectedTrees.length}
            </span>
          </div>

          <div
            className="p-4 rounded-2xl border flex flex-col justify-between"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Defect Rate
            </span>
            <span className="text-2xl font-extrabold text-amber-400 mt-2">
              {review.total_trees > 0
                ? `${Math.round((affectedTrees.length / review.total_trees) * 100)}%`
                : "0%"}
            </span>
          </div>
        </div>

        {/* No Affected Trees State */}
        {affectedTrees.length === 0 && (
          <div
            className="p-8 rounded-2xl border text-center space-y-3"
            style={{
              background: "rgba(34, 197, 94, 0.05)",
              borderColor: "rgba(34, 197, 94, 0.2)",
            }}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto text-xl">
              ✓
            </div>
            <h3 className="text-base font-bold text-zinc-100">
              No Affected Trees Recorded
            </h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              All {review.total_trees} trees were evaluated and found to be in healthy (OK) status during this inspection.
            </p>
          </div>
        )}

        {/* Affected Trees Cards List */}
        {affectedTrees.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-400 px-1">
              Affected Trees Inspection Findings ({affectedTrees.length})
            </h2>

            <div className="space-y-5">
              {affectedTrees.map((tree, idx) => (
                <div
                  key={tree.tree_id}
                  className="p-5 rounded-2xl border border-red-500/30 space-y-4"
                  style={{
                    background: "var(--bg-card)",
                  }}
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-red-600 text-white font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-mono font-bold text-base text-zinc-100">
                        {tree.tree_id}
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
                      {tree.variety && (
                        <span className="text-xs text-zinc-400 bg-white/5 px-2 py-0.5 rounded-md">
                          {tree.variety}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <a
                        href={`https://project-avacado-blush.vercel.app/trees?search=${encodeURIComponent(tree.tree_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/25 flex items-center gap-1.5 transition-all"
                        title="View details on dashboard"
                      >
                        <span>View on Dashboard</span>
                        <span className="text-[10px]">↗</span>
                      </a>
                      <div className="text-xs text-zinc-400 font-mono hidden sm:block">
                        <span>{tree.farm_location || "Attuvampatti"} • </span>
                        <span>GPS: {tree.latitude.toFixed(6)}, {tree.longitude.toFixed(6)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 3 Pillars Required by Specification:
                      1. Tree location displayed on a map
                      2. Tree photograph
                      3. Photograph of the affected point on the tree
                  */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 1. Map Location */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>1. Location on Map</span>
                      </span>
                      <div className="h-48 rounded-xl overflow-hidden border border-zinc-700/60">
                        <LocationPickerMap
                          lat={tree.latitude}
                          lng={tree.longitude}
                          onLocationSelect={() => {}}
                        />
                      </div>
                    </div>

                    {/* 2. Original Tree Photograph (from Main Database) */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <span>2. Tree Photo (Main DB)</span>
                        </span>
                        {Array.isArray(tree.all_tree_photos) && tree.all_tree_photos.length > 1 && (
                          <span className="text-[10px] text-zinc-400">
                            {tree.all_tree_photos.length} photos
                          </span>
                        )}
                      </span>
                      <div className="h-48 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900 flex items-center justify-center">
                        {(() => {
                          const dbPhotos = Array.isArray(tree.all_tree_photos) && tree.all_tree_photos.length > 0
                            ? tree.all_tree_photos
                            : tree.original_photo_url
                            ? [tree.original_photo_url]
                            : [];
                          if (dbPhotos.length === 0) {
                            return (
                              <div className="text-center text-zinc-500 text-xs p-4">
                                No photograph stored in main database
                              </div>
                            );
                          }
                          if (dbPhotos.length === 1) {
                            return (
                              <img
                                src={dbPhotos[0]}
                                alt={`Tree ${tree.tree_id}`}
                                className="w-full h-full object-cover"
                              />
                            );
                          }
                          return (
                            <div className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-thin">
                              {dbPhotos.map((url, pIdx) => (
                                <div key={pIdx} className="min-w-full w-full h-full shrink-0 snap-center relative">
                                  <img
                                    src={url}
                                    alt={`Tree ${tree.tree_id} #${pIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/80 text-white">
                                    {pIdx + 1}/{dbPhotos.length}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 3. Photograph of Affected Point */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          </svg>
                          <span>3. Affected Point Photo</span>
                        </span>
                        {getAffectedPhotoUrls(tree).length > 1 && (
                          <span className="text-[10px] text-zinc-400">
                            {getAffectedPhotoUrls(tree).length} photos
                          </span>
                        )}
                      </span>
                      <div className="h-48 rounded-xl overflow-hidden border border-red-500/40 bg-zinc-900 flex items-center justify-center relative">
                        {(() => {
                          const affectedUrls = getAffectedPhotoUrls(tree);
                          if (affectedUrls.length === 0) {
                            return (
                              <div className="text-center text-zinc-500 text-xs p-4">
                                No close-up photograph captured of affected point
                              </div>
                            );
                          }
                          if (affectedUrls.length === 1) {
                            return (
                              <img
                                src={affectedUrls[0]}
                                alt={`Affected point on ${tree.tree_id}`}
                                className="w-full h-full object-cover"
                              />
                            );
                          }
                          return (
                            <div className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-thin">
                              {affectedUrls.map((url, aIdx) => (
                                <div key={aIdx} className="min-w-full w-full h-full shrink-0 snap-center relative">
                                  <img
                                    src={url}
                                    alt={`Affected point #${aIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/80 text-white">
                                    {aIdx + 1}/{affectedUrls.length}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Notes / Observation Remarks */}
                  {tree.affected_notes && (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Inspector Notes & Defect Observation:
                      </span>
                      <p className="text-xs text-zinc-200">
                        {tree.affected_notes}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
