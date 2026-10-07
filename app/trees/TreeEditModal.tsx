"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { uploadTreeImage } from "@/lib/storage";
import type { TreeRecord } from "@/lib/types";
import { getVarietyImageUrls } from "@/lib/types";
import CameraCaptureModal from "../register/CameraCaptureModal";

// Dynamic import for Leaflet Map Picker (SSR disabled)
const LocationPickerMap = dynamic(
  () => import("../register/LocationPickerMap"),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-[260px] rounded-xl flex flex-col items-center justify-center gap-2"
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div
          className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
          style={{
            borderColor: "var(--accent)",
            borderTopColor: "transparent",
          }}
        />
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Loading satellite map…
        </p>
      </div>
    ),
  }
);

interface TreeEditModalProps {
  isOpen: boolean;
  tree: TreeRecord | null;
  onClose: () => void;
  onSaved: (updatedTree: TreeRecord) => void;
}

export default function TreeEditModal({
  isOpen,
  tree,
  onClose,
  onSaved,
}: TreeEditModalProps) {
  const [treeId, setTreeId] = useState("");
  const [type, setType] = useState<"tree" | "plant">("tree");
  const [farmLocation, setFarmLocation] = useState("Attuvampatti");
  const [variety, setVariety] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [isFruiting, setIsFruiting] = useState(false);
  const [isAffected, setIsAffected] = useState(false);
  const [isPruned, setIsPruned] = useState(false);
  const [note, setNote] = useState("");

  // Existing URLs
  const [existingVarietyImages, setExistingVarietyImages] = useState<string[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);

  // New files to upload
  const [newVarietyFiles, setNewVarietyFiles] = useState<File[]>([]);
  const [newVarietyPreviews, setNewVarietyPreviews] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);

  // Map picker toggle
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Live Camera modal
  const [cameraTarget, setCameraTarget] = useState<"variety" | "photo" | null>(null);

  // GPS state
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoSuccessMsg, setGeoSuccessMsg] = useState("");
  const [geoError, setGeoError] = useState("");

  // Saving state
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState<"idle" | "uploading" | "saving" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const photoInputRef = useRef<HTMLInputElement>(null);
  const varietyInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when tree changes
  useEffect(() => {
    if (tree) {
      setTreeId(tree.tree_id || "");
      setType(tree.type || "tree");
      setFarmLocation(tree.farm_location || "Attuvampatti");
      setVariety(tree.variety || "");
      setLatitude(tree.latitude?.toString() || "");
      setLongitude(tree.longitude?.toString() || "");
      setIsFruiting(!!tree.is_fruiting);
      setIsAffected(!!tree.is_affected);
      setIsPruned(!!tree.is_pruned);
      setNote(tree.note || "");
      setExistingVarietyImages(getVarietyImageUrls(tree.variety_image_url));
      setExistingPhotos(tree.image_urls || []);
      setNewVarietyFiles([]);
      setNewVarietyPreviews([]);
      setNewPhotoFiles([]);
      setNewPhotoPreviews([]);
      setShowMapPicker(false);
      setGeoError("");
      setGeoSuccessMsg("");
      setSavePhase("idle");
      setErrorMsg("");
    }
  }, [tree, isOpen]);

  // GPS Geolocation - High accuracy device position
  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setGeoLoading(true);
    setGeoError("");
    setGeoSuccessMsg("");

    let bestAcc = Infinity;
    let settled = false;

    const applyPos = (pos: GeolocationPosition) => {
      const acc = pos.coords.accuracy ?? Infinity;
      if (acc < bestAcc || !settled) {
        bestAcc = Math.min(acc, bestAcc);
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGeoSuccessMsg(
          `Location detected (accuracy: ±${Math.round(pos.coords.accuracy || 10)}m)`
        );
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPos(pos);
        setGeoLoading(false);
        settled = true;
      },
      (err) => {
        setGeoLoading(false);
        settled = true;
        setGeoError(err.message || "Failed to retrieve device location.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  const handleMapLocationSelect = useCallback((lat: number, lng: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setGeoSuccessMsg("Location updated from map pin");
  }, []);

  // Variety image add / remove
  const handleVarietyFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setNewVarietyFiles((prev) => [...prev, ...files]);
    setNewVarietyPreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
    e.target.value = "";
  };

  const removeExistingVarietyImage = (index: number) => {
    setExistingVarietyImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeNewVarietyFile = (index: number) => {
    setNewVarietyFiles((prev) => prev.filter((_, i) => i !== index));
    setNewVarietyPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Photo image add / remove
  const handlePhotoFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setNewPhotoFiles((prev) => [...prev, ...files]);
    setNewPhotoPreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
    e.target.value = "";
  };

  const removeExistingPhoto = (index: number) => {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const removeNewPhoto = (index: number) => {
    setNewPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Camera capture
  const handleCameraCapture = (file: File) => {
    if (cameraTarget === "variety") {
      setNewVarietyFiles((prev) => [...prev, file]);
      setNewVarietyPreviews((prev) => [...prev, URL.createObjectURL(file)]);
    } else if (cameraTarget === "photo") {
      setNewPhotoFiles((prev) => [...prev, file]);
      setNewPhotoPreviews((prev) => [...prev, URL.createObjectURL(file)]);
    }
    setCameraTarget(null);
  };

  // Save changes
  const handleSave = async () => {
    if (!tree) return;

    if (!treeId.trim()) {
      setErrorMsg("Tree ID is required.");
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);

    if (isNaN(latNum) || isNaN(lngNum)) {
      setErrorMsg("Valid Latitude and Longitude coordinates are required.");
      return;
    }

    setSaving(true);
    setSavePhase("uploading");
    setErrorMsg("");

    try {
      // 1. Upload new variety files
      const uploadedVarietyUrls: string[] = [];
      for (let i = 0; i < newVarietyFiles.length; i++) {
        const url = await uploadTreeImage(newVarietyFiles[i], "variety", i);
        uploadedVarietyUrls.push(url);
      }
      const finalVarietyUrls = [...existingVarietyImages, ...uploadedVarietyUrls];

      // 2. Upload new photo files
      const uploadedPhotoUrls: string[] = [];
      for (let i = 0; i < newPhotoFiles.length; i++) {
        const url = await uploadTreeImage(newPhotoFiles[i], "photos", i);
        uploadedPhotoUrls.push(url);
      }
      const finalPhotoUrls = [...existingPhotos, ...uploadedPhotoUrls];

      // 3. Update Supabase record
      setSavePhase("saving");
      const updatedData: Partial<TreeRecord> = {
        tree_id: treeId.trim(),
        type,
        farm_location: farmLocation,
        variety: variety.trim() || null,
        variety_image_url:
          finalVarietyUrls.length > 0 ? finalVarietyUrls.join(",") : null,
        latitude: latNum,
        longitude: lngNum,
        is_fruiting: isFruiting,
        is_affected: isAffected,
        is_pruned: isPruned,
        note: note.trim() || null,
        image_urls: finalPhotoUrls,
      };

      const { data, error: updateError } = await supabase
        .from("trees")
        .update(updatedData)
        .eq("id", tree.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      setSavePhase("done");
      setTimeout(() => {
        setSaving(false);
        onSaved((data as TreeRecord) || { ...tree, ...updatedData });
        onClose();
      }, 500);
    } catch (err: unknown) {
      setSaving(false);
      setSavePhase("error");
      const message = err instanceof Error ? err.message : "Failed to update record";
      setErrorMsg(message);
    }
  };

  if (!isOpen || !tree) return null;

  return (
    <>
      <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/80 backdrop-blur-md">
        <div
          className="relative w-full max-w-2xl my-6 rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-secondary)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b shrink-0"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-100">
                  Edit Record: <span className="text-emerald-400 font-mono">{tree.tree_id}</span>
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Modify details, status, variety, and location coordinates
                </p>
              </div>
            </div>

            {/* Clear separate Exit button */}
            <button
              onClick={onClose}
              disabled={saving}
              className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
              title="Close modal"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-5">
            {errorMsg && (
              <div className="p-3 rounded-xl text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. Farm Location & Tree ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Farm Location <span className="text-red-400">*</span>
                </label>
                <select
                  value={farmLocation}
                  onChange={(e) => setFarmLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm focus:outline-none transition-all"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="Attuvampatti">Attuvampatti</option>
                  <option value="Gundupatti">Gundupatti</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Tree ID / Tag <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={treeId}
                  onChange={(e) => setTreeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-mono focus:outline-none transition-all"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="e.g. T-042"
                />
              </div>
            </div>

            {/* 2. Type & Variety */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Classification <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType("tree")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                      type === "tree"
                        ? "border-emerald-500 text-emerald-400 bg-emerald-500/15"
                        : "border-zinc-800 text-zinc-400 hover:bg-white/5"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Tree</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("plant")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                      type === "plant"
                        ? "border-teal-500 text-teal-400 bg-teal-500/15"
                        : "border-zinc-800 text-zinc-400 hover:bg-white/5"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <span>Plant</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Variety Name
                </label>
                <input
                  type="text"
                  value={variety}
                  onChange={(e) => setVariety(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm focus:outline-none transition-all"
                  style={{
                    background: "var(--bg-input)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="e.g. Hass, Fuerte, Bacon"
                />
              </div>
            </div>

            {/* 3. Location / GPS Coordinates (Enhanced Current Location option) */}
            <div
              className="p-4 rounded-xl border space-y-3"
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                borderColor: "var(--border-primary)",
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-200 block">
                    GPS Coordinates & Location
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Use high-accuracy device GPS or adjust on satellite map
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Current Location Option */}
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={geoLoading}
                    className="px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 active:scale-95 shadow-sm"
                    title="Auto-detect current GPS location"
                  >
                    {geoLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <circle cx="12" cy="12" r="7" />
                        <line x1="12" y1="1" x2="12" y2="5" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="1" y1="12" x2="5" y2="12" />
                        <line x1="19" y1="12" x2="23" y2="12" />
                      </svg>
                    )}
                    <span>{geoLoading ? "Detecting GPS…" : "Current Location"}</span>
                  </button>

                  {/* Pin on Map Option */}
                  <button
                    type="button"
                    onClick={() => setShowMapPicker(!showMapPicker)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      showMapPicker
                        ? "border-zinc-600 bg-zinc-800 text-white"
                        : "border-zinc-800 text-zinc-300 hover:bg-white/5"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    <span>{showMapPicker ? "Close Map" : "Pin on Map"}</span>
                  </button>
                </div>
              </div>

              {geoSuccessMsg && (
                <p className="text-xs text-emerald-400 font-medium">{geoSuccessMsg}</p>
              )}
              {geoError && (
                <p className="text-xs text-red-400">{geoError}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase text-zinc-400 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none"
                    style={{
                      background: "var(--bg-input)",
                      borderColor: "var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="10.238114"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase text-zinc-400 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none"
                    style={{
                      background: "var(--bg-input)",
                      borderColor: "var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="77.489182"
                  />
                </div>
              </div>

              {showMapPicker && (
                <div className="pt-2">
                  <p className="text-[11px] text-zinc-400 mb-2">
                    Click anywhere on the map or drag the pin to set the coordinates:
                  </p>
                  <LocationPickerMap
                    lat={parseFloat(latitude) || null}
                    lng={parseFloat(longitude) || null}
                    onLocationSelect={handleMapLocationSelect}
                  />
                </div>
              )}
            </div>

            {/* 4. Status Flags (Clean Professional Cards) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Status Parameters
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setIsFruiting(!isFruiting)}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    isFruiting
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-sm"
                      : "border-zinc-800 text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${isFruiting ? "bg-emerald-400" : "bg-zinc-600"}`} />
                  <span>Fruiting</span>
                  <span className={`text-[10px] uppercase font-bold ${isFruiting ? "text-emerald-400" : "text-zinc-500"}`}>
                    {isFruiting ? "Active" : "None"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAffected(!isAffected)}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    isAffected
                      ? "border-red-500/50 bg-red-500/15 text-red-300 shadow-sm"
                      : "border-zinc-800 text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${isAffected ? "bg-red-400" : "bg-zinc-600"}`} />
                  <span>Affected</span>
                  <span className={`text-[10px] uppercase font-bold ${isAffected ? "text-red-400" : "text-zinc-500"}`}>
                    {isAffected ? "Flagged" : "Normal"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPruned(!isPruned)}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    isPruned
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-300 shadow-sm"
                      : "border-zinc-800 text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${isPruned ? "bg-amber-400" : "bg-zinc-600"}`} />
                  <span>Pruned</span>
                  <span className={`text-[10px] uppercase font-bold ${isPruned ? "text-amber-400" : "text-zinc-500"}`}>
                    {isPruned ? "Done" : "Pending"}
                  </span>
                </button>
              </div>
            </div>

            {/* 5. Notes */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Notes & Field Remarks
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm focus:outline-none transition-all resize-none"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
                placeholder="Enter condition notes or observation remarks…"
              />
            </div>

            {/* 6. Variety Reference Images */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Variety Reference Photos
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => varietyInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg border border-zinc-800 text-xs font-medium text-zinc-300 hover:bg-white/5"
                  >
                    + Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraTarget("variety")}
                    className="px-2.5 py-1 rounded-lg border border-zinc-800 text-xs font-medium text-zinc-300 hover:bg-white/5"
                  >
                    Camera
                  </button>
                </div>
              </div>

              <input
                ref={varietyInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleVarietyFileInput}
              />

              <div className="flex flex-wrap gap-2">
                {existingVarietyImages.map((url, idx) => (
                  <div key={`exist-var-${idx}`} className="relative w-16 h-16 rounded-xl border border-zinc-700/60 overflow-hidden">
                    <img src={url} alt={`Variety ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeExistingVarietyImage(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow-md"
                      title="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {newVarietyPreviews.map((preview, idx) => (
                  <div key={`new-var-${idx}`} className="relative w-16 h-16 rounded-xl border border-emerald-500/50 overflow-hidden">
                    <img src={preview} alt={`New Variety ${idx}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[8px] font-bold text-center py-0.5">NEW</span>
                    <button
                      type="button"
                      onClick={() => removeNewVarietyFile(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow-md"
                      title="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {existingVarietyImages.length === 0 && newVarietyPreviews.length === 0 && (
                  <p className="text-xs text-zinc-500 py-1">No reference photos attached.</p>
                )}
              </div>
            </div>

            {/* 7. Tree Field Photos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Field Images
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg border border-zinc-800 text-xs font-medium text-zinc-300 hover:bg-white/5"
                  >
                    + Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraTarget("photo")}
                    className="px-2.5 py-1 rounded-lg border border-zinc-800 text-xs font-medium text-zinc-300 hover:bg-white/5"
                  >
                    Camera
                  </button>
                </div>
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoFileInput}
              />

              <div className="flex flex-wrap gap-2">
                {existingPhotos.map((url, idx) => (
                  <div key={`exist-photo-${idx}`} className="relative w-16 h-16 rounded-xl border border-zinc-700/60 overflow-hidden">
                    <img src={url} alt={`Tree Photo ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow-md"
                      title="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {newPhotoPreviews.map((preview, idx) => (
                  <div key={`new-photo-${idx}`} className="relative w-16 h-16 rounded-xl border border-emerald-500/50 overflow-hidden">
                    <img src={preview} alt={`New Photo ${idx}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[8px] font-bold text-center py-0.5">NEW</span>
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow-md"
                      title="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {existingPhotos.length === 0 && newPhotoPreviews.length === 0 && (
                  <p className="text-xs text-zinc-500 py-1">No field images attached.</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div
            className="flex items-center justify-end gap-3 px-5 py-3.5 border-t shrink-0"
            style={{
              background: "rgba(10, 12, 16, 0.95)",
              borderColor: "var(--border-primary)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-800 text-zinc-300 hover:bg-white/5 active:scale-95"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
              style={{
                background: "var(--accent)",
                color: "#ffffff",
                boxShadow: "0 4px 14px rgba(22, 163, 74, 0.35)",
              }}
            >
              {saving && (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>
                {savePhase === "uploading"
                  ? "Uploading Media…"
                  : savePhase === "saving"
                  ? "Saving Changes…"
                  : savePhase === "done"
                  ? "Saved!"
                  : "Save Changes"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* WebRTC Live Camera Modal */}
      <CameraCaptureModal
        isOpen={cameraTarget !== null}
        onClose={() => setCameraTarget(null)}
        onCapture={handleCameraCapture}
        title={cameraTarget === "variety" ? "Capture Variety Photo" : "Capture Field Photo"}
      />
    </>
  );
}
