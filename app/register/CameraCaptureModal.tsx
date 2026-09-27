"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}

export default function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
  title = "Take Photo",
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Stop camera tracks helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    stopCamera();
    setLoading(true);
    setError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API is not supported on this browser or context.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setLoading(false);
    } catch (err) {
      console.error("Camera access error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to access camera. Please check permissions."
      );
      setLoading(false);
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Switch between back/front camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Capture snapshot from video feed
  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const filename = `photo_${Date.now()}.jpg`;
        const file = new File([blob], filename, { type: "image/jpeg" });
        onCapture(file);
        stopCamera();
        onClose();
      },
      "image/jpeg",
      0.92
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col border shadow-2xl"
        style={{
          background: "var(--card)",
          borderColor: "var(--card-border)",
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "var(--card-border)" }}>
          <h3 className="font-bold text-base flex items-center gap-2" style={{ color: "var(--foreground)" }}>
            📷 {title}
          </h3>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-white/10"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Video Preview */}
        <div className="relative w-full bg-black aspect-[4/3] flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <svg className="animate-spin h-8 w-8 text-emerald-500" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="text-sm">Initializing Camera…</span>
            </div>
          )}

          {error && (
            <div className="p-6 text-center text-red-400 space-y-3">
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs text-gray-400">
                You can also use the native device file picker camera option.
              </p>
            </div>
          )}

          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
          />

          {/* Switch Camera Button overlay */}
          {!loading && !error && (
            <button
              type="button"
              onClick={toggleFacingMode}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md bg-black/60 text-white border border-white/20 flex items-center gap-1.5 hover:bg-black/80"
            >
              🔄 Flip ({facingMode === "environment" ? "Back" : "Front"})
            </button>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 flex items-center justify-between gap-3 border-t" style={{ borderColor: "var(--card-border)" }}>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border"
            style={{
              borderColor: "var(--input-border)",
              color: "var(--muted)",
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading || !!error}
            onClick={handleSnap}
            className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{
              background: "var(--primary)",
              color: "#fff",
            }}
          >
            📸 Capture Photo
          </button>
        </div>
      </div>
    </div>
  );
}
