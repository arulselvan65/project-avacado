"use client";

import { useState, useRef, useCallback, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CameraCaptureModal from "./CameraCaptureModal";
import Navbar from "../components/Navbar";

// ─── Dynamic Import for Leaflet Map Component (SSR disabled) ─────────────────
const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-[320px] rounded-xl flex flex-col items-center justify-center gap-2"
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border-primary)",
      }}
    >
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        Loading satellite map…
      </p>
    </div>
  ),
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  tree_id: string;
  type: "tree" | "plant" | "";
  variety: string;
  latitude: string;
  longitude: string;
  is_fruiting: boolean;
  is_affected: boolean;
  is_pruned: boolean;
  note: string;
  farm_location: string;
}

interface FormErrors {
  tree_id?: string;
  type?: string;
  latitude?: string;
  longitude?: string;
  farm_location?: string;
}

type GeoStatus = "idle" | "loading" | "error";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INITIAL_FORM: FormData = {
  tree_id: "",
  type: "",
  variety: "",
  latitude: "",
  longitude: "",
  is_fruiting: false,
  is_affected: false,
  is_pruned: false,
  note: "",
  farm_location: "",
};

/**
 * Uploads a single file to the Supabase `tree-images` storage bucket.
 * Returns the public URL of the uploaded file.
 */
async function uploadFile(
  file: File,
  pathPrefix: string,
  index?: number
): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path =
    index !== undefined
      ? `${pathPrefix}/${timestamp}-${index}-${safeName}`
      : `${pathPrefix}/${timestamp}-${safeName}`;

  const { error } = await supabase.storage
    .from("tree-images")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from("tree-images").getPublicUrl(path);

  return publicUrl;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconCamera({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconUpload({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconMapPin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconMap({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCrosshair({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}

// ─── Toggle Helper Component ─────────────────────────────────────────────────

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between py-3 px-4 rounded-xl transition-colors"
      style={{
        background: checked ? "var(--accent-subtle)" : "var(--bg-input)",
        border: `1px solid ${checked ? "var(--border-accent)" : "var(--border-primary)"}`,
      }}
    >
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

// ─── Section Label Component ─────────────────────────────────────────────────

function SectionLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {children}
        {required && (
          <span className="ml-0.5" style={{ color: "var(--danger)" }}>
            *
          </span>
        )}
      </label>
      {hint && (
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoError, setGeoError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<
    "idle" | "uploading" | "saving" | "success" | "error"
  >("idle");
  const [submitErrorMsg, setSubmitErrorMsg] = useState("");
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Variety images state (multiple files)
  const [varietyFiles, setVarietyFiles] = useState<File[]>([]);
  const [varietyPreviews, setVarietyPreviews] = useState<string[]>([]);

  // Variety file inputs (Gallery vs Camera)
  const varietyGalleryInputRef = useRef<HTMLInputElement>(null);
  const varietyCameraInputRef = useRef<HTMLInputElement>(null);

  // Tree/plant images state (multiple files)
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  // Photo file inputs (Gallery vs Camera)
  const photoGalleryInputRef = useRef<HTMLInputElement>(null);
  const photoCameraInputRef = useRef<HTMLInputElement>(null);

  // WebRTC Camera Modal state
  const [cameraModalTarget, setCameraModalTarget] = useState<
    "variety" | "photo" | null
  >(null);

  // ─── Field updater ──────────────────────────────────────────────────────

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
      setSubmitResult(null);
    },
    []
  );

  // ─── Geolocation & Map handler ──────────────────────────────────────────

  const watchIdRef = useRef<number | null>(null);

  const handleGetLocation = useCallback(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGeoStatus("error");
      setGeoError(
        "Geolocation requires a secure connection (HTTPS). On mobile, testing via IP address (HTTP) will block location access."
      );
      return;
    }

    if (!navigator.geolocation) {
      setGeoStatus("error");
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setGeoStatus("loading");
    setGeoError("");

    let bestAccuracy = Infinity;
    let settled = false;

    const applyPosition = (pos: GeolocationPosition) => {
      const acc = pos.coords.accuracy ?? Infinity;
      // Ignore highly inaccurate IP-based locations if we already have a decent fix
      if (bestAccuracy < 1000 && acc > 2000) return;

      if (acc < bestAccuracy || !settled) {
        bestAccuracy = Math.min(acc, bestAccuracy);
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setErrors((prev) => ({
          ...prev,
          latitude: undefined,
          longitude: undefined,
        }));
      }
    };

    const handleError = (err: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      setGeoStatus("error");
      switch (err.code) {
        case err.PERMISSION_DENIED:
          setGeoError(
            "Location permission denied. Please allow location access in browser settings."
          );
          break;
        case err.POSITION_UNAVAILABLE:
          setGeoError("Location information is unavailable.");
          break;
        case err.TIMEOUT:
          setGeoError("Location request timed out. Please try again.");
          break;
        default:
          setGeoError("An unknown error occurred getting location.");
      }
    };

    // Phase 1: Quick initial fix
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos);
        // Phase 2: Refine with watchPosition for up to 5s
        const watchId = navigator.geolocation.watchPosition(
          (refinedPos) => {
            applyPosition(refinedPos);
          },
          () => { /* ignore watch errors, we already have a fix */ },
          { enableHighAccuracy: true, maximumAge: 0 }
        );
        watchIdRef.current = watchId;

        setTimeout(() => {
          if (watchIdRef.current === watchId) {
            navigator.geolocation.clearWatch(watchId);
            watchIdRef.current = null;
          }
          if (!settled) {
            settled = true;
            setGeoStatus("idle");
          }
        }, 5000);
      },
      handleError,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  const handleMapLocationSelect = useCallback(
    (lat: number, lng: number) => {
      // If user interacts with map, cancel any ongoing watchPosition refinement
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setGeoStatus("idle");
      }
      
      setForm((prev) => ({
        ...prev,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      }));
      setErrors((prev) => ({
        ...prev,
        latitude: undefined,
        longitude: undefined,
      }));
    },
    []
  );

  // ─── Variety Image File Handlers (Multiple) ───────────────────────────

  const addVarietyFiles = useCallback((newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setVarietyFiles((prev) => [...prev, ...newFiles]);
    setVarietyPreviews((prev) => [
      ...prev,
      ...newFiles.map((f) => URL.createObjectURL(f)),
    ]);
  }, []);

  const handleVarietyFilesInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      addVarietyFiles(files);
      e.target.value = ""; // reset input
    },
    [addVarietyFiles]
  );

  const removeVarietyFile = useCallback((index: number) => {
    setVarietyFiles((prev) => prev.filter((_, i) => i !== index));
    setVarietyPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearVarietyFiles = useCallback(() => {
    setVarietyFiles([]);
    setVarietyPreviews([]);
    if (varietyGalleryInputRef.current) varietyGalleryInputRef.current.value = "";
    if (varietyCameraInputRef.current) varietyCameraInputRef.current.value = "";
  }, []);

  // ─── Photo Files Handlers (Multiple) ────────────────────────────────────

  const addPhotoFiles = useCallback((newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setPhotoFiles((prev) => [...prev, ...newFiles]);
    setPhotoPreviews((prev) => [
      ...prev,
      ...newFiles.map((f) => URL.createObjectURL(f)),
    ]);
  }, []);

  const handlePhotoFilesInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      addPhotoFiles(files);
      e.target.value = ""; // reset input
    },
    [addPhotoFiles]
  );

  const removePhoto = useCallback((index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Camera Modal Capture Callback ──────────────────────────────────────

  const handleCameraCapture = useCallback(
    (file: File) => {
      if (cameraModalTarget === "variety") {
        addVarietyFiles([file]);
      } else if (cameraModalTarget === "photo") {
        addPhotoFiles([file]);
      }
      setCameraModalTarget(null);
    },
    [cameraModalTarget, addVarietyFiles, addPhotoFiles]
  );

  // ─── Validation ─────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.farm_location) errs.farm_location = "Farm location is required.";
    if (!form.tree_id.trim()) errs.tree_id = "Tree ID is required.";
    if (!form.type) errs.type = "Type is required.";
    if (!form.latitude.trim()) {
      errs.latitude = "Latitude is required.";
    } else if (isNaN(Number(form.latitude))) {
      errs.latitude = "Latitude must be a number.";
    }
    if (!form.longitude.trim()) {
      errs.longitude = "Longitude is required.";
    } else if (isNaN(Number(form.longitude))) {
      errs.longitude = "Longitude must be a number.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitResult(null);

    if (!validate()) return;

    setSubmitting(true);
    setSubmitPhase("uploading");
    setSubmitErrorMsg("");

    try {
      // 1. Upload all variety images if provided
      const variety_image_urls: string[] = [];
      for (let i = 0; i < varietyFiles.length; i++) {
        const url = await uploadFile(varietyFiles[i], "variety", i);
        variety_image_urls.push(url);
      }

      // 2. Upload all photo images
      const image_urls: string[] = [];
      for (let i = 0; i < photoFiles.length; i++) {
        const url = await uploadFile(photoFiles[i], "photos", i);
        image_urls.push(url);
      }

      // 3. Insert record into Supabase
      setSubmitPhase("saving");
      const { error: insertError } = await supabase.from("trees").insert({
        tree_id: form.tree_id.trim(),
        type: form.type,
        variety: form.variety.trim() || null,
        variety_image_url:
          variety_image_urls.length > 0 ? variety_image_urls.join(",") : null,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        is_fruiting: form.is_fruiting,
        is_affected: form.is_affected,
        is_pruned: form.is_pruned,
        note: form.note.trim() || null,
        farm_location: form.farm_location,
        image_urls,
      });

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      // Success — reset form
      setSubmitPhase("success");
      setSubmitResult({
        ok: true,
        msg: "Tree/plant registered successfully!",
      });
      setForm(INITIAL_FORM);
      clearVarietyFiles();
      setPhotoFiles([]);
      setPhotoPreviews([]);
    } catch (err) {
      setSubmitPhase("error");
      const msg = err instanceof Error ? err.message : "An unknown error occurred.";
      setSubmitErrorMsg(msg);
      setSubmitResult({
        ok: false,
        msg,
      });
    } finally {
      setSubmitting(false);
    }
  };


  // ─── Render ─────────────────────────────────────────────────────────────

  const latNum = form.latitude ? parseFloat(form.latitude) : null;
  const lngNum = form.longitude ? parseFloat(form.longitude) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* ── Universal Navbar ── */}
      <Navbar />

      {/* ── Form ── */}
      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Submit result banner */}
          {submitResult && (
            <div
              className="px-4 py-3 rounded-xl text-sm font-medium border flex items-center gap-2.5"
              style={{
                background: submitResult.ok
                  ? "var(--success-bg)"
                  : "var(--danger-bg)",
                borderColor: submitResult.ok
                  ? "var(--success-border)"
                  : "var(--danger-border)",
                color: submitResult.ok ? "var(--accent)" : "var(--danger)",
              }}
            >
              {submitResult.ok ? <IconCheck size={16} /> : <IconX size={16} />}
              {submitResult.msg}
            </div>
          )}

          {/* ── Farm Location ── */}
          <div>
            <SectionLabel required>Farm Location</SectionLabel>
            <select
              value={form.farm_location}
              onChange={(e) => updateField("farm_location", e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm transition-all appearance-none"
              style={{
                background: "var(--bg-input)",
                border: errors.farm_location
                  ? "1px solid var(--danger)"
                  : "1px solid var(--border-primary)",
                color: form.farm_location ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              <option value="" disabled>Select a location</option>
              <option value="Attuvampatti">Attuvampatti</option>
              <option value="Gundupatti">Gundupatti</option>
            </select>
            {errors.farm_location && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {errors.farm_location}
              </p>
            )}
          </div>

          {/* ── Tree ID ── */}
          <div>
            <SectionLabel required>Tree ID</SectionLabel>
            <input
              type="text"
              value={form.tree_id}
              onChange={(e) => updateField("tree_id", e.target.value)}
              placeholder="e.g. T-001"
              className="w-full px-4 py-3 rounded-xl text-sm transition-all"
              style={{
                background: "var(--bg-input)",
                border: errors.tree_id
                  ? "1px solid var(--danger)"
                  : "1px solid var(--border-primary)",
                color: "var(--text-primary)",
              }}
            />
            {errors.tree_id && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {errors.tree_id}
              </p>
            )}
          </div>

          {/* ── Type ── */}
          <div>
            <SectionLabel required>Type</SectionLabel>
            <select
              value={form.type}
              onChange={(e) =>
                updateField("type", e.target.value as FormData["type"])
              }
              className="w-full px-4 py-3 rounded-xl text-sm transition-all appearance-none cursor-pointer"
              style={{
                background: "var(--bg-input)",
                border: errors.type
                  ? "1px solid var(--danger)"
                  : "1px solid var(--border-primary)",
                color: form.type ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              <option value="">Select type…</option>
              <option value="tree">Tree</option>
              <option value="plant">Plant</option>
            </select>
            {errors.type && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>
                {errors.type}
              </p>
            )}
          </div>

          {/* ── Variety ── */}
          <div>
            <SectionLabel>Variety</SectionLabel>
            <input
              type="text"
              value={form.variety}
              onChange={(e) => updateField("variety", e.target.value)}
              placeholder="e.g. Mango, Tulsi, Neem…"
              className="w-full px-4 py-3 rounded-xl text-sm transition-all"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* ── Variety Images ── */}
          <div className="space-y-2.5">
            <SectionLabel hint={varietyPreviews.length > 0 ? `${varietyPreviews.length} file${varietyPreviews.length > 1 ? "s" : ""}` : undefined}>
              Variety Photos
            </SectionLabel>

            {/* Hidden native inputs */}
            <input
              ref={varietyGalleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleVarietyFilesInput}
            />
            <input
              ref={varietyCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleVarietyFilesInput}
            />

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCameraModalTarget("variety")}
                className="py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                <IconCamera size={14} />
                Take Photo
              </button>

              <button
                type="button"
                onClick={() => varietyGalleryInputRef.current?.click()}
                className="py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                <IconUpload size={14} />
                Upload Files
              </button>
            </div>

            {/* Variety Photos Preview Grid */}
            {varietyPreviews.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {varietyPreviews.map((src, i) => (
                  <div key={i} className="relative aspect-square group">
                    <img
                      src={src}
                      alt={`Variety photo ${i + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                      style={{ border: "1px solid var(--border-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={() => removeVarietyFile(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        background: "var(--danger)",
                        color: "#fff",
                      }}
                      aria-label="Remove photo"
                    >
                      <IconX size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Location Section ── */}
          <div className="space-y-2.5">
            <SectionLabel required hint="Drag pin or tap map">
              Location
            </SectionLabel>

            {/* Current Location Button */}
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={geoStatus === "loading"}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              style={{
                background:
                  geoStatus === "loading"
                    ? "var(--bg-elevated)"
                    : "var(--blue)",
                color: "#fff",
                opacity: geoStatus === "loading" ? 0.7 : 1,
                border: "none",
              }}
            >
              {geoStatus === "loading" ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Getting precise location…
                </>
              ) : (
                <>
                  <IconCrosshair size={15} />
                  Use Current Location
                </>
              )}
            </button>

            {geoStatus === "error" && geoError && (
              <p
                className="text-xs px-3 py-2.5 rounded-lg"
                style={{
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  color: "var(--danger)",
                }}
              >
                {geoError}
              </p>
            )}

            {/* Interactive Leaflet Satellite Map Picker */}
            <LocationPickerMap
              lat={latNum}
              lng={lngNum}
              onLocationSelect={handleMapLocationSelect}
            />

            {/* Lat / Long Numeric Inputs */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => updateField("latitude", e.target.value)}
                  placeholder="12.345678"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all"
                  style={{
                    background: "var(--bg-input)",
                    border: errors.latitude
                      ? "1px solid var(--danger)"
                      : "1px solid var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                {errors.latitude && (
                  <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                    {errors.latitude}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => updateField("longitude", e.target.value)}
                  placeholder="77.654321"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all"
                  style={{
                    background: "var(--bg-input)",
                    border: errors.longitude
                      ? "1px solid var(--danger)"
                      : "1px solid var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                {errors.longitude && (
                  <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                    {errors.longitude}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Boolean Toggles ── */}
          <div className="space-y-2">
            <SectionLabel>Status</SectionLabel>
            <Toggle
              label="Fruiting"
              checked={form.is_fruiting}
              onChange={(v) => updateField("is_fruiting", v)}
            />
            <Toggle
              label="Affected"
              checked={form.is_affected}
              onChange={(v) => updateField("is_affected", v)}
            />
            <Toggle
              label="Pruned"
              checked={form.is_pruned}
              onChange={(v) => updateField("is_pruned", v)}
            />
          </div>

          {/* ── Note ── */}
          <div>
            <SectionLabel>Note</SectionLabel>
            <textarea
              value={form.note}
              onChange={(e) => updateField("note", e.target.value)}
              placeholder="Any additional notes…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm resize-y transition-all"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* ── Tree/Plant Images ── */}
          <div className="space-y-2.5">
            <SectionLabel hint={photoPreviews.length > 0 ? `${photoPreviews.length} file${photoPreviews.length > 1 ? "s" : ""}` : undefined}>
              Tree / Plant Photos
            </SectionLabel>

            {/* Hidden native inputs */}
            <input
              ref={photoGalleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoFilesInput}
            />
            <input
              ref={photoCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoFilesInput}
            />

            {/* Image Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCameraModalTarget("photo")}
                className="py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                <IconCamera size={14} />
                Take Photo
              </button>

              <button
                type="button"
                onClick={() => photoGalleryInputRef.current?.click()}
                className="py-2.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                <IconUpload size={14} />
                Upload Files
              </button>
            </div>

            {/* Photos Preview Grid */}
            {photoPreviews.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative aspect-square group">
                    <img
                      src={src}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                      style={{ border: "1px solid var(--border-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        background: "var(--danger)",
                        color: "#fff",
                      }}
                    >
                      <IconX size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Submit Button ── */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              background: submitting ? "var(--bg-elevated)" : "var(--accent)",
              color: "#fff",
              opacity: submitting ? 0.6 : 1,
              border: "none",
            }}
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Registering…
              </>
            ) : (
              <>
                <IconCheck size={16} />
                Register
              </>
            )}
          </button>
        </form>
      </main>

      {/* ── WebRTC Live Camera Modal ── */}
      <CameraCaptureModal
        isOpen={cameraModalTarget !== null}
        onClose={() => setCameraModalTarget(null)}
        onCapture={handleCameraCapture}
        title={
          cameraModalTarget === "variety"
            ? "Variety Photo"
            : "Tree / Plant Photo"
        }
      />

      {/* ── Submit Overlay Dialog ── */}
      {submitPhase !== "idle" && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
          style={{
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-8 text-center space-y-5 shadow-2xl"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-secondary)",
            }}
          >
            {/* Uploading / Saving states */}
            {(submitPhase === "uploading" || submitPhase === "saving") && (
              <>
                <div className="flex items-center justify-center">
                  <div
                    className="w-12 h-12 border-3 border-t-transparent rounded-full animate-spin"
                    style={{
                      borderColor: "var(--accent)",
                      borderTopColor: "transparent",
                      borderWidth: "3px",
                    }}
                  />
                </div>
                <div>
                  <p
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {submitPhase === "uploading"
                      ? "Uploading photos…"
                      : "Saving record…"}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {submitPhase === "uploading"
                      ? "Please wait while your photos are being uploaded."
                      : "Almost done. Writing to the database."}
                  </p>
                </div>
              </>
            )}

            {/* Success state */}
            {submitPhase === "success" && (
              <>
                <div className="flex items-center justify-center">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{
                      background: "rgba(34, 197, 94, 0.15)",
                      border: "2px solid rgba(34, 197, 94, 0.4)",
                    }}
                  >
                    <svg
                      className="w-7 h-7"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Registered Successfully
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    The tree/plant has been added to the database.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitPhase("idle")}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{
                    background: "var(--accent)",
                    color: "#ffffff",
                  }}
                >
                  Continue
                </button>
              </>
            )}

            {/* Error state */}
            {submitPhase === "error" && (
              <>
                <div className="flex items-center justify-center">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "2px solid rgba(239, 68, 68, 0.4)",
                    }}
                  >
                    <svg
                      className="w-7 h-7"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Registration Failed
                  </p>
                  <p
                    className="text-xs mt-1 break-words"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {submitErrorMsg || "An unknown error occurred."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitPhase("idle")}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{
                    background: "var(--danger)",
                    color: "#ffffff",
                  }}
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
