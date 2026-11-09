"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Navbar from "@/app/components/Navbar";
import CameraCaptureModal from "@/app/register/CameraCaptureModal";
import {
  type TreeReviewRecord,
  type TreeReviewItem,
  getAffectedPhotoUrls,
} from "@/lib/reviewTypes";
import {
  getReviewById,
  saveReviewRecord,
  deleteReviewRecord,
  uploadAffectedPointPhoto,
  calculateReviewMetrics,
} from "@/lib/reviewStorage";

// Dynamic import of ReviewMapView (SSR disabled for Leaflet)
const ReviewMapView = dynamic(() => import("./ReviewMapView"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full min-h-[500px] flex flex-col items-center justify-center gap-3"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
        Initializing Satellite Map & Review Points…
      </span>
    </div>
  ),
});

export default function ReviewExecutionPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params?.id as string;

  const [review, setReview] = useState<TreeReviewRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode: Map View (default) or List View
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  // Filter by classification type (Tab)
  const [typeTab, setTypeTab] = useState<"ALL" | "tree" | "plant" | "regrown" | "dead">("ALL");

  // Selected tree for the review modal / bottom sheet
  const [selectedTree, setSelectedTree] = useState<TreeReviewItem | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Saving state
  const [savingPartial, setSavingPartial] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [completing, setCompleting] = useState(false);
  const [savingModalItem, setSavingModalItem] = useState(false);
  const [modalSavedMsg, setModalSavedMsg] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [mapUpdatedToast, setMapUpdatedToast] = useState<string | null>(null);

  // Delete review state
  const [showDeleteReviewModal, setShowDeleteReviewModal] = useState(false);
  const [isDeletingReview, setIsDeletingReview] = useState(false);

  // Complete confirmation modal (shown when some trees are still unreviewed)
  const [showPendingConfirmModal, setShowPendingConfirmModal] = useState(false);

  // Camera modal state for affected point photo
  const [cameraActiveTreeId, setCameraActiveTreeId] = useState<string | null>(null);
  const [uploadingTreeId, setUploadingTreeId] = useState<string | null>(null);
  const affectedFileInputRef = useRef<HTMLInputElement>(null);
  const [targetFileInputTreeId, setTargetFileInputTreeId] = useState<string | null>(null);

  // Load review record
  const loadReview = useCallback(async () => {
    if (!reviewId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getReviewById(reviewId);
      if (!data) {
        throw new Error(`Review with ID "${reviewId}" was not found.`);
      }
      setReview(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load review";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  // Set individual tree status (OK or Affected) with immediate auto-save and map update feedback
  const setItemStatus = async (treeId: string, status: "ok" | "affected" | null) => {
    if (!review) return;
    setIsUpdatingStatus(treeId);

    const updatedItems = review.items.map((item) => {
      if (item.tree_id === treeId) {
        return {
          ...item,
          status,
          reviewed_at: status !== null ? new Date().toISOString() : null,
          affected_photo_url: status === "ok" || status === null ? null : item.affected_photo_url,
          affected_notes: status === "ok" || status === null ? null : item.affected_notes,
        };
      }
      return item;
    });

    const metrics = calculateReviewMetrics(updatedItems);
    const updatedReview: TreeReviewRecord = {
      ...review,
      ...metrics,
      items: updatedItems,
    };

    setReview(updatedReview);

    // Keep selectedTree in sync
    const current = updatedItems.find((i) => i.tree_id === treeId);
    if (current) setSelectedTree(current);

    try {
      await saveReviewRecord(updatedReview);
      setMapUpdatedToast(
        status !== null
          ? `✓ Map pin updated: ${treeId} marked ${status.toUpperCase()}`
          : `Map pin reset: ${treeId}`
      );
      setTimeout(() => setMapUpdatedToast(null), 3000);
    } catch (e) {
      console.warn("Auto save error:", e);
    } finally {
      setTimeout(() => setIsUpdatingStatus(null), 350);
    }
  };

  // Update affected tree remarks
  const updateAffectedNotes = async (treeId: string, notes: string) => {
    if (!review) return;

    const updatedItems = review.items.map((item) => {
      if (item.tree_id === treeId) {
        return { ...item, affected_notes: notes };
      }
      return item;
    });

    const updatedReview: TreeReviewRecord = {
      ...review,
      items: updatedItems,
    };

    setReview(updatedReview);

    if (selectedTree?.tree_id === treeId) {
      const current = updatedItems.find((i) => i.tree_id === treeId);
      if (current) setSelectedTree(current);
    }

    await saveReviewRecord(updatedReview);
  };

  // Remove affected point photo (all or a specific index)
  const removeAffectedPhoto = async (treeId: string, photoIndex?: number) => {
    if (!review) return;

    const updatedItems = review.items.map((item) => {
      if (item.tree_id === treeId) {
        const existing = getAffectedPhotoUrls(item);
        let updatedUrls: string[];
        if (photoIndex !== undefined) {
          updatedUrls = existing.filter((_, idx) => idx !== photoIndex);
        } else {
          updatedUrls = [];
        }
        return {
          ...item,
          affected_photo_urls: updatedUrls,
          affected_photo_url: updatedUrls[0] || null,
        };
      }
      return item;
    });

    const updatedReview: TreeReviewRecord = {
      ...review,
      items: updatedItems,
    };

    setReview(updatedReview);

    if (selectedTree?.tree_id === treeId) {
      const current = updatedItems.find((i) => i.tree_id === treeId);
      if (current) setSelectedTree(current);
    }

    await saveReviewRecord(updatedReview);
  };

  // Handle Affected Point Camera Capture (Multiple Photos supported)
  const handleAffectedCameraCapture = async (files: File[]) => {
    if (!cameraActiveTreeId || files.length === 0 || !review) return;
    const targetId = cameraActiveTreeId;
    setCameraActiveTreeId(null);
    setUploadingTreeId(targetId);

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const publicUrl = await uploadAffectedPointPhoto(files[i], review.id, targetId, i);
        uploadedUrls.push(publicUrl);
      }

      const updatedItems = review.items.map((item) => {
        if (item.tree_id === targetId) {
          const existing = getAffectedPhotoUrls(item);
          const finalUrls = [...existing, ...uploadedUrls];
          return {
            ...item,
            affected_photo_urls: finalUrls,
            affected_photo_url: finalUrls[0] || null,
          };
        }
        return item;
      });

      const updatedReview: TreeReviewRecord = {
        ...review,
        items: updatedItems,
      };

      setReview(updatedReview);

      if (selectedTree?.tree_id === targetId) {
        const current = updatedItems.find((i) => i.tree_id === targetId);
        if (current) setSelectedTree(current);
      }

      await saveReviewRecord(updatedReview);
    } catch (err) {
      alert("Failed to upload affected point photo: " + (err instanceof Error ? err.message : ""));
    } finally {
      setUploadingTreeId(null);
    }
  };

  // Handle Affected Point File Input (Multiple Photos supported)
  const handleAffectedFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !targetFileInputTreeId || !review) return;
    const targetId = targetFileInputTreeId;
    setTargetFileInputTreeId(null);
    setUploadingTreeId(targetId);
    e.target.value = "";

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const publicUrl = await uploadAffectedPointPhoto(files[i], review.id, targetId, i);
        uploadedUrls.push(publicUrl);
      }

      const updatedItems = review.items.map((item) => {
        if (item.tree_id === targetId) {
          const existing = getAffectedPhotoUrls(item);
          const finalUrls = [...existing, ...uploadedUrls];
          return {
            ...item,
            affected_photo_urls: finalUrls,
            affected_photo_url: finalUrls[0] || null,
          };
        }
        return item;
      });

      const updatedReview: TreeReviewRecord = {
        ...review,
        items: updatedItems,
      };

      setReview(updatedReview);

      if (selectedTree?.tree_id === targetId) {
        const current = updatedItems.find((i) => i.tree_id === targetId);
        if (current) setSelectedTree(current);
      }

      await saveReviewRecord(updatedReview);
    } catch (err) {
      alert("Failed to upload affected point photo: " + (err instanceof Error ? err.message : ""));
    } finally {
      setUploadingTreeId(null);
    }
  };

  // Partial Saving (Requirement 3)
  const handlePartialSave = async () => {
    if (!review) return;
    setSavingPartial(true);
    setSaveSuccessMsg("");

    try {
      await saveReviewRecord(review);
      const typeLabel = typeTab === "ALL" ? "All types" : `${typeTab.toUpperCase()} trees`;
      setSaveSuccessMsg(`Progress saved for ${typeLabel}! You can safely exit and resume anytime.`);
      setTimeout(() => setSaveSuccessMsg(""), 5000);
    } catch (err) {
      alert("Failed to save review progress: " + (err instanceof Error ? err.message : ""));
    } finally {
      setSavingPartial(false);
    }
  };

  // Save and close modal with loading animation and map update feedback
  const handleModalSaveAndClose = async () => {
    if (!review) return;
    setSavingModalItem(true);
    setModalSavedMsg("Saving & updating map…");

    try {
      await saveReviewRecord(review);
      setModalSavedMsg("✓ Saved & Map Updated!");
      setMapUpdatedToast(`✓ Map updated for Tree ${selectedTree?.tree_id || ""}`);
      setTimeout(() => setMapUpdatedToast(null), 3000);

      setTimeout(() => {
        setSavingModalItem(false);
        setModalSavedMsg("");
        setSelectedTree(null);
      }, 450);
    } catch (err) {
      alert("Failed to save changes: " + (err instanceof Error ? err.message : ""));
      setSavingModalItem(false);
      setModalSavedMsg("");
    }
  };

  // Delete entire review record
  const handleDeleteReview = async () => {
    if (!review) return;
    setIsDeletingReview(true);
    try {
      await deleteReviewRecord(review.id);
      router.push("/reviews");
    } catch (err) {
      alert("Failed to delete review: " + (err instanceof Error ? err.message : ""));
      setIsDeletingReview(false);
    }
  };

  // Next tree navigation inside modal
  const handleNextTree = () => {
    if (!review || !selectedTree) return;
    const currentIndex = filteredItems.findIndex((i) => i.tree_id === selectedTree.tree_id);
    if (currentIndex >= 0 && currentIndex < filteredItems.length - 1) {
      setSelectedTree(filteredItems[currentIndex + 1]);
    }
  };

  // Prev tree navigation inside modal
  const handlePrevTree = () => {
    if (!review || !selectedTree) return;
    const currentIndex = filteredItems.findIndex((i) => i.tree_id === selectedTree.tree_id);
    if (currentIndex > 0) {
      setSelectedTree(filteredItems[currentIndex - 1]);
    }
  };

  // Requirement 4: Complete Review flow
  const handleCompleteClick = () => {
    if (!review) return;

    if (review.unreviewed_count > 0) {
      // Show confirmation dialog with options instead of failing silently
      setShowPendingConfirmModal(true);
      return;
    }

    executeComplete(review);
  };

  // Mark all unreviewed as OK and complete
  const handleMarkRemainingAsOkAndComplete = async () => {
    if (!review) return;
    setShowPendingConfirmModal(false);
    setCompleting(true);

    const updatedItems = review.items.map((item) => {
      if (item.status === null || item.status === undefined) {
        return {
          ...item,
          status: "ok" as const,
          reviewed_at: new Date().toISOString(),
        };
      }
      return item;
    });

    const metrics = calculateReviewMetrics(updatedItems);
    const completedReview: TreeReviewRecord = {
      ...review,
      ...metrics,
      status: "completed",
      completed_at: new Date().toISOString(),
      items: updatedItems,
    };

    try {
      await saveReviewRecord(completedReview);
      setReview(completedReview);
      router.push(`/reviews/${review.id}/report`);
    } catch (err) {
      alert("Failed to complete review: " + (err instanceof Error ? err.message : ""));
      setCompleting(false);
    }
  };

  // Execute complete when all reviewed
  const executeComplete = async (rec: TreeReviewRecord) => {
    setCompleting(true);
    try {
      const completedReview: TreeReviewRecord = {
        ...rec,
        status: "completed",
        completed_at: new Date().toISOString(),
      };
      await saveReviewRecord(completedReview);
      setReview(completedReview);
      router.push(`/reviews/${rec.id}/report`);
    } catch (err) {
      alert("Failed to complete review: " + (err instanceof Error ? err.message : ""));
      setCompleting(false);
    }
  };

  // Filter items for display
  const filteredItems = useMemo(() => {
    if (!review) return [];
    return review.items.filter((item) => {
      if (typeTab !== "ALL" && item.type !== typeTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = item.tree_id.toLowerCase().includes(q);
        const matchVariety = item.variety?.toLowerCase().includes(q);
        const matchLocation = item.farm_location?.toLowerCase().includes(q);
        if (!matchId && !matchVariety && !matchLocation) return false;
      }
      return true;
    });
  }, [review, typeTab, searchQuery]);

  // Tab counts
  const tabCounts = useMemo(() => {
    if (!review) return { ALL: 0, tree: 0, plant: 0, regrown: 0, dead: 0 };
    return {
      ALL: review.items.filter((i) => i.status === null).length,
      tree: review.items.filter((i) => i.type === "tree" && i.status === null).length,
      plant: review.items.filter((i) => i.type === "plant" && i.status === null).length,
      regrown: review.items.filter((i) => i.type === "regrown" && i.status === null).length,
      dead: review.items.filter((i) => i.type === "dead" && i.status === null).length,
    };
  }, [review]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Loading Review Checklist & Map…
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
          <h2 className="text-base font-bold text-zinc-100">Review Not Found</h2>
          <p className="text-xs text-zinc-400">{error || "Review record could not be loaded."}</p>
          <Link
            href="/reviews"
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-zinc-800 text-zinc-200 hover:text-white"
          >
            ← Back to Reviews History
          </Link>
        </div>
      </div>
    );
  }

  const isCompleted = review.status === "completed";
  const reviewedCount = review.ok_count + review.affected_count;
  const progressPct = review.total_trees > 0 ? Math.round((reviewedCount / review.total_trees) * 100) : 0;
  const allReviewed = review.unreviewed_count === 0;

  return (
    <div className="h-screen flex flex-col w-full max-w-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      <Navbar />

      {/* Hidden file input for affected point upload */}
      <input
        ref={affectedFileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleAffectedFileInput}
      />

      {/* Sticky Header with Title, Progress, and Action Controls */}
      <header
        className="shrink-0 z-[1050] border-b"
        style={{
          background: "rgba(10, 12, 16, 0.95)",
          backdropFilter: "blur(12px)",
          borderColor: "var(--border-secondary)",
        }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Title & Date */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href="/reviews"
                  className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1 shrink-0"
                >
                  <span>← History</span>
                </Link>
                <span className="text-zinc-600">/</span>
                <span className="text-xs font-mono font-bold text-emerald-400 truncate">
                  {review.id}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                    isCompleted
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {isCompleted ? "Completed" : "In Progress"}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mt-0.5">
                <h1 className="text-sm sm:text-base font-bold text-zinc-100 truncate">
                  {review.title}
                </h1>
                <span className="text-[11px] text-zinc-400 font-mono hidden md:inline">
                  • Date: {review.review_date}
                </span>
              </div>
            </div>

            {/* View Mode Toggle, Partial Save, and Complete */}
            <div className="flex items-center gap-2 shrink-0">
              {/* View Mode Toggle: Map vs List */}
              <div className="p-0.5 rounded-xl border border-zinc-700 bg-white/[0.04] flex items-center">
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    viewMode === "map"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                  title="Interactive Map with GPS tracking"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                  <span>Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    viewMode === "list"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                  title="List Checklist View"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <span>List</span>
                </button>
              </div>

              {/* Partial Save Button */}
              <button
                type="button"
                onClick={handlePartialSave}
                disabled={savingPartial}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-700 bg-white/[0.04] text-zinc-200 hover:bg-white/10 active:scale-95 transition-all flex items-center gap-1.5"
                title="Partially save review progress"
              >
                {savingPartial ? (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                )}
                <span className="hidden xs:inline">
                  {savingPartial
                    ? "Saving…"
                    : typeTab === "ALL"
                    ? "Save Progress"
                    : `Save (${typeTab})`}
                </span>
              </button>

              {/* Complete Review Button / Report Button */}
              {isCompleted ? (
                <Link
                  href={`/reviews/${review.id}/report`}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>Report</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleCompleteClick}
                  disabled={completing}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md active:scale-95 ${
                    allReviewed
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse"
                      : "bg-emerald-700/80 hover:bg-emerald-600 text-white"
                  }`}
                  title="Complete review and generate report"
                >
                  {completing ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  <span>
                    {completing
                      ? "Finalizing…"
                      : allReviewed
                      ? "Complete Review"
                      : `Complete (${review.unreviewed_count} Left)`}
                  </span>
                </button>
              )}

              {/* Delete Review Button */}
              <button
                type="button"
                onClick={() => setShowDeleteReviewModal(true)}
                className="p-1.5 rounded-xl border border-zinc-700 bg-white/[0.04] text-zinc-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 active:scale-95 transition-all"
                title="Delete this entire review record"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Toast Notification */}
          {saveSuccessMsg && (
            <div className="p-2 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
              <span>{saveSuccessMsg}</span>
              <button
                type="button"
                onClick={() => setSaveSuccessMsg("")}
                className="text-emerald-400 hover:text-white ml-2 text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* Progress Bar & Filter Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-zinc-800/80">
            {/* Type Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
              {(
                [
                  { id: "ALL", label: "All" },
                  { id: "tree", label: "Trees" },
                  { id: "plant", label: "Plants" },
                  { id: "regrown", label: "Regrown" },
                  { id: "dead", label: "Dead" },
                ] as const
              ).map((tab) => {
                const isActive = typeTab === tab.id;
                const pendingCount = tabCounts[tab.id];

                return (
                  <button
                    key={tab.id}
                    onClick={() => setTypeTab(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 shrink-0 ${
                      isActive
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "bg-white/5 text-zinc-400 hover:bg-white/10"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {pendingCount > 0 && (
                      <span
                        className={`px-1 rounded-full text-[9px] font-bold ${
                          isActive
                            ? "bg-black/30 text-white"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-3 text-xs text-zinc-400 shrink-0">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {review.ok_count} OK
              </span>
              <span className="flex items-center gap-1 text-red-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {review.affected_count} Affected
              </span>
              {review.unreviewed_count > 0 && (
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {review.unreviewed_count} Pending
                </span>
              )}
              <span className="font-mono text-zinc-200">
                ({progressPct}%)
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {/* 1. MAP VIEW (Default with GPS Location Tracking) */}
        {viewMode === "map" && (
          <div className="relative w-full h-full">
            {/* Live Map Update Toast */}
            {mapUpdatedToast && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 rounded-xl bg-zinc-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-bold shadow-2xl backdrop-blur-md flex items-center gap-2 animate-bounce pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{mapUpdatedToast}</span>
              </div>
            )}

            <ReviewMapView
              items={filteredItems}
              selectedTreeId={selectedTree?.tree_id ?? null}
              onSelectTree={(tree) => setSelectedTree(tree)}
            />

            {/* Floating Map Legend */}
            <div
              className="absolute bottom-6 left-4 z-[1000] p-2.5 rounded-xl text-xs space-y-1.5 backdrop-blur-md shadow-xl border hidden xs:block"
              style={{
                background: "rgba(17, 20, 27, 0.88)",
                borderColor: "var(--border-secondary)",
                color: "var(--text-secondary)",
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Status Legend
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm" />
                <span className="text-[11px] text-zinc-200">OK</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" />
                <span className="text-[11px] text-zinc-200">Affected</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm" />
                <span className="text-[11px] text-zinc-200">Pending Review</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-zinc-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm animate-pulse" />
                <span className="text-[11px] text-zinc-200">You (GPS)</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. LIST VIEW */}
        {viewMode === "list" && (
          <div className="h-full overflow-y-auto px-4 py-6 max-w-7xl mx-auto space-y-3">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                No trees match the current filter.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.tree_id}
                  onClick={() => setSelectedTree(item)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-emerald-500/50 ${
                    item.status === "affected"
                      ? "border-red-500/40 bg-red-950/[0.06]"
                      : item.status === "ok"
                      ? "border-emerald-500/30 bg-emerald-950/[0.04]"
                      : "border-zinc-800 bg-zinc-900/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700/60">
                        {item.original_photo_url ? (
                          <img src={item.original_photo_url} alt={item.tree_id} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-zinc-500">
                            No Pic
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-zinc-100">{item.tree_id}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-white/5 text-zinc-300">
                            {item.type}
                          </span>
                          {item.variety && (
                            <span className="text-xs text-zinc-400">{item.variety}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 font-mono">
                          {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === "ok" && (
                        <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          ✓ OK
                        </span>
                      )}
                      {item.status === "affected" && (
                        <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                          ! Affected
                        </span>
                      )}
                      {item.status === null && (
                        <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ── Tree Review Action Modal / Bottom Sheet ─────────────────────────── */}
      {selectedTree && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-zinc-700/80 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: "rgba(18, 21, 28, 0.98)" }}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-start gap-3 min-w-0">
                {/* Original Photo Preview */}
                <div className="w-14 h-14 rounded-xl border border-zinc-700 overflow-hidden shrink-0 bg-zinc-900 relative">
                  {selectedTree.original_photo_url ? (
                    <img
                      src={selectedTree.original_photo_url}
                      alt={selectedTree.tree_id}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600">
                      No Photo
                    </div>
                  )}
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-zinc-300 font-bold text-center py-0.5">
                    MAIN DB
                  </span>
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-bold text-zinc-100">
                      {selectedTree.tree_id}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-zinc-300 capitalize">
                      {selectedTree.type}
                    </span>
                    {selectedTree.variety && (
                      <span className="text-xs text-zinc-400 bg-white/5 px-2 py-0.5 rounded-md">
                        {selectedTree.variety}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 font-mono">
                    GPS: {selectedTree.latitude.toFixed(6)}, {selectedTree.longitude.toFixed(6)}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Location: {selectedTree.farm_location || "Attuvampatti"}
                  </p>
                </div>
              </div>

              {/* Prev / Next & Close */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevTree}
                  className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-white/5 text-xs"
                  title="Previous tree"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={handleNextTree}
                  className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-white/5 text-xs"
                  title="Next tree"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTree(null)}
                  className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-white/5 text-xs ml-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Choose OK or Affected Option */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Evaluation Status <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {isUpdatingStatus === selectedTree.tree_id && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold animate-pulse">
                      <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      <span>Updating map pin…</span>
                    </div>
                  )}
                  {selectedTree.status !== null && (
                    <button
                      type="button"
                      onClick={() => setItemStatus(selectedTree.tree_id, null)}
                      className="text-[11px] text-zinc-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
                      title="Clear evaluation and reset to pending"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                      <span>Reset Status</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* OK Button */}
                <button
                  type="button"
                  onClick={() => setItemStatus(selectedTree.tree_id, "ok")}
                  className={`py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    selectedTree.status === "ok"
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400"
                      : "border border-zinc-700 bg-white/[0.03] text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300"
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>OK</span>
                </button>

                {/* Affected Button */}
                <button
                  type="button"
                  onClick={() => setItemStatus(selectedTree.tree_id, "affected")}
                  className={`py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    selectedTree.status === "affected"
                      ? "bg-red-600 text-white shadow-lg shadow-red-600/35 ring-2 ring-red-400"
                      : "border border-zinc-700 bg-white/[0.03] text-zinc-300 hover:border-red-500/50 hover:text-red-300"
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>Affected</span>
                </button>
              </div>
            </div>

            {/* If Affected: Ask for Photographs & Defect Notes */}
            {selectedTree.status === "affected" && (
              <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-950/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-400">
                    Photograph of Affected Point
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCameraActiveTreeId(selectedTree.tree_id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-500 flex items-center gap-1 transition-all active:scale-95"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTargetFileInputTreeId(selectedTree.tree_id);
                        affectedFileInputRef.current?.click();
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border border-zinc-700 bg-white/5 text-zinc-300 hover:bg-white/10"
                    >
                      Upload
                    </button>
                  </div>
                </div>

                {/* Upload indicator / Preview */}
                {uploadingTreeId === selectedTree.tree_id && (
                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center gap-2 text-xs text-zinc-400">
                    <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    <span>Uploading affected point photograph(s)…</span>
                  </div>
                )}

                {(() => {
                  const affectedPhotos = getAffectedPhotoUrls(selectedTree);
                  if (affectedPhotos.length === 0) {
                    return (
                      <p className="text-[11px] text-zinc-400">
                        Please take or upload photograph(s) of the affected point for the PDF defect report.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="font-semibold text-red-300">
                          Attached Photos ({affectedPhotos.length})
                        </span>
                        <span className="text-[10px] text-zinc-500">Tap ✕ to remove</span>
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {affectedPhotos.map((url, pIdx) => (
                          <div
                            key={pIdx}
                            className="relative shrink-0 w-24 h-24 rounded-xl border-2 border-red-500/40 overflow-hidden group bg-zinc-900 shadow-md"
                          >
                            <img
                              src={url}
                              alt={`Affected point ${pIdx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeAffectedPhoto(selectedTree.tree_id, pIdx)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow-md hover:bg-red-500 active:scale-90 transition-transform"
                              title="Remove photo"
                            >
                              ✕
                            </button>
                            <span className="absolute bottom-0 inset-x-0 bg-red-950/90 text-[8px] text-red-200 font-bold text-center py-0.5">
                              #{pIdx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Defect Remarks */}
                <div>
                  <input
                    type="text"
                    value={selectedTree.affected_notes || ""}
                    onChange={(e) => updateAffectedNotes(selectedTree.tree_id, e.target.value)}
                    placeholder="Defect remarks (e.g. Stem borer, dieback, fungus)…"
                    className="w-full px-3 py-2 rounded-xl border text-xs focus:outline-none"
                    style={{
                      background: "var(--bg-input)",
                      borderColor: "var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="text-[11px] text-zinc-500">
                Auto-saved on change
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTree(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-800 text-zinc-300 hover:bg-white/5"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleModalSaveAndClose}
                  disabled={selectedTree.status === null || savingModalItem}
                  className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md active:scale-95 disabled:opacity-40 flex items-center gap-2"
                >
                  {savingModalItem ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                  )}
                  <span>
                    {savingModalItem
                      ? modalSavedMsg || "Saving & Updating Map…"
                      : "Save & Update Map"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending Trees Confirmation Dialog ───────────────────────────────
          Shown if user clicks complete with pending trees
      */}
      {showPendingConfirmModal && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div
            className="w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-lg">
                !
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-100">
                  {review.unreviewed_count} Trees Pending Evaluation
                </h3>
                <p className="text-xs text-zinc-400">
                  Every tree must have an OK or Affected status before the report is generated.
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              You can mark all remaining <strong className="text-emerald-400">{review.unreviewed_count}</strong> unreviewed trees as healthy (<strong>OK</strong>) to finish immediately, or continue evaluating them.
            </p>

            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleMarkRemainingAsOkAndComplete}
                className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md active:scale-95"
              >
                ✓ Mark Remaining as OK & Complete
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPendingConfirmModal(false);
                  // Find first unreviewed tree and select it
                  const firstPending = review.items.find((i) => i.status === null);
                  if (firstPending) setSelectedTree(firstPending);
                }}
                className="w-full py-2.5 rounded-xl text-xs font-semibold border border-zinc-700 bg-white/5 text-zinc-300 hover:bg-white/10"
              >
                Continue Reviewing Pending Trees
              </button>

              <button
                type="button"
                onClick={() => setShowPendingConfirmModal(false)}
                className="w-full py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Modal for Affected Point Photo */}
      <CameraCaptureModal
        isOpen={cameraActiveTreeId !== null}
        onClose={() => setCameraActiveTreeId(null)}
        onCapture={handleAffectedCameraCapture}
        title={`Capture Affected Point (${cameraActiveTreeId || ""})`}
      />

      {/* Delete Review Cycle Modal */}
      {showDeleteReviewModal && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="w-full max-w-sm p-5 rounded-2xl border shadow-2xl space-y-4"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <h3 className="font-bold text-sm text-zinc-100">Delete Review Cycle</h3>
            <p className="text-xs text-zinc-400">
              Are you sure you want to permanently delete review <strong className="text-white font-mono">{review.id}</strong>? All checklist and report data will be removed.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteReviewModal(false)}
                disabled={isDeletingReview}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-800 text-zinc-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReview}
                disabled={isDeletingReview}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {isDeletingReview && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>{isDeletingReview ? "Deleting…" : "Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
