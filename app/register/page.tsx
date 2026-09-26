"use client";

import { useState, useRef, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
}

interface FormErrors {
  tree_id?: string;
  type?: string;
  latitude?: string;
  longitude?: string;
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
};

/**
 * Uploads a single file to the Supabase `tree-images` storage bucket.
 * Returns the public URL of the uploaded file.
 *
 * Path convention:
 * - Variety images:  variety/{timestamp}-{filename}
 * - Photo images:    photos/{timestamp}-{index}-{filename}
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

  // Get the public URL from the bucket (bucket must be public)
  const {
    data: { publicUrl },
  } = supabase.storage.from("tree-images").getPublicUrl(path);

  return publicUrl;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoError, setGeoError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Variety image (single file)
  const [varietyFile, setVarietyFile] = useState<File | null>(null);
  const [varietyPreview, setVarietyPreview] = useState<string | null>(null);
  const varietyInputRef = useRef<HTMLInputElement>(null);

  // Tree/plant images (multiple files)
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ─── Field updater ──────────────────────────────────────────────────────

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      // Clear the field error when the user starts typing
      setErrors((prev) => ({ ...prev, [key]: undefined }));
      setSubmitResult(null);
    },
    []
  );

  // ─── Geolocation ────────────────────────────────────────────────────────

  const handleGetLocation = useCallback(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setGeoStatus("error");
      setGeoError("Geolocation requires a secure connection (HTTPS). On mobile, testing via IP address (HTTP) will block location access.");
      return;
    }

    if (!navigator.geolocation) {
      setGeoStatus("error");
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setGeoStatus("loading");
    setGeoError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
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
        setGeoStatus("idle");
      },
      (err) => {
        setGeoStatus("error");
        // Provide a human-readable error for each error code
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoError(
              "Location permission denied. Please allow location access in your browser settings."
            );
            break;
          case err.POSITION_UNAVAILABLE:
            setGeoError("Location information is unavailable.");
            break;
          case err.TIMEOUT:
            setGeoError("Location request timed out. Please try again.");
            break;
          default:
            setGeoError("An unknown error occurred getting your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  // ─── File handlers ──────────────────────────────────────────────────────

  const handleVarietyFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setVarietyFile(file);
      if (file) {
        setVarietyPreview(URL.createObjectURL(file));
      } else {
        setVarietyPreview(null);
      }
    },
    []
  );

  const clearVarietyFile = useCallback(() => {
    setVarietyFile(null);
    setVarietyPreview(null);
    if (varietyInputRef.current) varietyInputRef.current.value = "";
  }, []);

  const handlePhotoFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      setPhotoFiles((prev) => [...prev, ...files]);
      setPhotoPreviews((prev) => [
        ...prev,
        ...files.map((f) => URL.createObjectURL(f)),
      ]);
    },
    []
  );

  const removePhoto = useCallback((index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
    // Clear the native input so the user can re-select the same file if needed
    if (photoInputRef.current) photoInputRef.current.value = "";
  }, []);

  // ─── Validation ─────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: FormErrors = {};
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

    try {
      // 1. Upload variety image if provided
      let variety_image_url: string | null = null;
      if (varietyFile) {
        variety_image_url = await uploadFile(varietyFile, "variety");
      }

      // 2. Upload all photo images, collecting URLs into an array
      const image_urls: string[] = [];
      for (let i = 0; i < photoFiles.length; i++) {
        const url = await uploadFile(photoFiles[i], "photos", i);
        image_urls.push(url);
      }

      // 3. Insert the record into the `trees` table
      const { error: insertError } = await supabase.from("trees").insert({
        tree_id: form.tree_id.trim(),
        type: form.type,
        variety: form.variety.trim() || null,
        variety_image_url,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        is_fruiting: form.is_fruiting,
        is_affected: form.is_affected,
        is_pruned: form.is_pruned,
        note: form.note.trim() || null,
        image_urls,
      });

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      // Success — reset the entire form including file inputs
      setSubmitResult({
        ok: true,
        msg: "Tree/plant registered successfully!",
      });
      setForm(INITIAL_FORM);
      clearVarietyFile();
      setPhotoFiles([]);
      setPhotoPreviews([]);
      if (photoInputRef.current) photoInputRef.current.value = "";
    } catch (err) {
      // On failure, keep the user's entered data so they don't lose it
      setSubmitResult({
        ok: false,
        msg: err instanceof Error ? err.message : "An unknown error occurred.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render helpers ─────────────────────────────────────────────────────

  /**
   * Styled toggle switch used for boolean fields (fruiting, affected, pruned).
   * Uses a hidden checkbox + CSS-only slider for accessibility and styling.
   */
  const Toggle = ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-center justify-between py-3 px-4 rounded-xl"
      style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)" }}>
      <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b backdrop-blur-md"
        style={{
          background: "rgba(15, 17, 23, 0.85)",
          borderColor: "var(--card-border)",
        }}
      >
        <h1 className="text-lg font-bold" style={{ color: "var(--primary)" }}>
          🌱 Register Tree / Plant
        </h1>
        <Link
          href="/map"
          className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          style={{
            background: "var(--input-bg)",
            color: "var(--accent)",
            border: "1px solid var(--input-border)",
          }}
        >
          🗺️ View Map
        </Link>
      </header>

      {/* ── Form ── */}
      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* ── Submit result banner ── */}
          {submitResult && (
            <div
              className="px-4 py-3 rounded-xl text-sm font-medium border"
              style={{
                background: submitResult.ok
                  ? "var(--success-bg)"
                  : "var(--error-bg)",
                borderColor: submitResult.ok
                  ? "var(--success-border)"
                  : "var(--error-border)",
                color: submitResult.ok
                  ? "var(--primary)"
                  : "var(--danger)",
              }}
            >
              {submitResult.msg}
            </div>
          )}

          {/* ── Tree ID ── */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
              Tree ID <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.tree_id}
              onChange={(e) => updateField("tree_id", e.target.value)}
              placeholder="e.g. T-001"
              className="w-full px-4 py-3 rounded-xl text-base outline-none transition-colors"
              style={{
                background: "var(--input-bg)",
                border: errors.tree_id
                  ? "1px solid var(--danger)"
                  : "1px solid var(--input-border)",
                color: "var(--foreground)",
              }}
            />
            {errors.tree_id && (
              <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                {errors.tree_id}
              </p>
            )}
          </div>

          {/* ── Type ── */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
              Type <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <select
              value={form.type}
              onChange={(e) =>
                updateField("type", e.target.value as FormData["type"])
              }
              className="w-full px-4 py-3 rounded-xl text-base outline-none transition-colors appearance-none"
              style={{
                background: "var(--input-bg)",
                border: errors.type
                  ? "1px solid var(--danger)"
                  : "1px solid var(--input-border)",
                color: form.type ? "var(--foreground)" : "var(--muted)",
              }}
            >
              <option value="">Select type…</option>
              <option value="tree">🌳 Tree</option>
              <option value="plant">🌿 Plant</option>
            </select>
            {errors.type && (
              <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                {errors.type}
              </p>
            )}
          </div>

          {/* ── Variety ── */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
              Variety
            </label>
            <input
              type="text"
              value={form.variety}
              onChange={(e) => updateField("variety", e.target.value)}
              placeholder="e.g. Mango, Tulsi, Neem…"
              className="w-full px-4 py-3 rounded-xl text-base outline-none transition-colors"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* ── Variety Image ── */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
              Variety Image
            </label>
            <input
              ref={varietyInputRef}
              type="file"
              accept="image/*"
              onChange={handleVarietyFile}
              className="w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:font-medium file:cursor-pointer"
              style={{
                color: "var(--muted)",
              }}
            />
            {varietyPreview && (
              <div className="mt-2 relative inline-block">
                <img
                  src={varietyPreview}
                  alt="Variety preview"
                  className="w-20 h-20 object-cover rounded-lg border"
                  style={{ borderColor: "var(--input-border)" }}
                />
                <button
                  type="button"
                  onClick={clearVarietyFile}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: "var(--danger)",
                    color: "#fff",
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* ── Location ── */}
          <div>
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={geoStatus === "loading"}
              className="w-full py-3.5 rounded-xl text-base font-semibold transition-all"
              style={{
                background:
                  geoStatus === "loading"
                    ? "var(--input-bg)"
                    : "var(--accent)",
                color: "#fff",
                opacity: geoStatus === "loading" ? 0.7 : 1,
              }}
            >
              {geoStatus === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
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
                  Getting location…
                </span>
              ) : (
                "📍 Use My Current Location"
              )}
            </button>

            {geoStatus === "error" && geoError && (
              <p
                className="mt-2 text-xs px-3 py-2 rounded-lg"
                style={{
                  background: "var(--error-bg)",
                  color: "var(--danger)",
                }}
              >
                {geoError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
                  Latitude <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => updateField("latitude", e.target.value)}
                  placeholder="12.345678"
                  className="w-full px-4 py-3 rounded-xl text-base outline-none transition-colors"
                  style={{
                    background: "var(--input-bg)",
                    border: errors.latitude
                      ? "1px solid var(--danger)"
                      : "1px solid var(--input-border)",
                    color: "var(--foreground)",
                  }}
                />
                {errors.latitude && (
                  <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                    {errors.latitude}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
                  Longitude <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => updateField("longitude", e.target.value)}
                  placeholder="77.654321"
                  className="w-full px-4 py-3 rounded-xl text-base outline-none transition-colors"
                  style={{
                    background: "var(--input-bg)",
                    border: errors.longitude
                      ? "1px solid var(--danger)"
                      : "1px solid var(--input-border)",
                    color: "var(--foreground)",
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

          {/* ── Boolean toggles ── */}
          <div className="space-y-3">
            <Toggle
              label="🍎 Is Fruiting?"
              checked={form.is_fruiting}
              onChange={(v) => updateField("is_fruiting", v)}
            />
            <Toggle
              label="🐛 Is Affected?"
              checked={form.is_affected}
              onChange={(v) => updateField("is_affected", v)}
            />
            <Toggle
              label="✂️ Is Pruned?"
              checked={form.is_pruned}
              onChange={(v) => updateField("is_pruned", v)}
            />
          </div>

          {/* ── Note ── */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
              Note
            </label>
            <textarea
              value={form.note}
              onChange={(e) => updateField("note", e.target.value)}
              placeholder="Any additional notes…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-base outline-none resize-y transition-colors"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* ── Tree/Plant Images (multiple) ── */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
              Tree / Plant Images
            </label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoFiles}
              className="w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:font-medium file:cursor-pointer"
              style={{ color: "var(--muted)" }}
            />
            {photoPreviews.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative inline-block">
                    <img
                      src={src}
                      alt={`Photo ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border"
                      style={{ borderColor: "var(--input-border)" }}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: "var(--danger)",
                        color: "#fff",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl text-base font-bold transition-all"
            style={{
              background: submitting
                ? "var(--muted)"
                : "var(--primary)",
              color: "#fff",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
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
                Registering…
              </span>
            ) : (
              "✅ Register Tree / Plant"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
