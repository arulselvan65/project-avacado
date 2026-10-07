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

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isMounted = true;

    async function initCamera() {
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

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (isMounted) {
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Camera access error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to access camera. Please check permissions."
        );
        setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      void initCamera();
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopCamera();
    };
  }, [isOpen, facingMode, stopCamera]);

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
    <div className="fixed inset-0 z-[9999] w-screen h-[100dvh] bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* ── Background Video Viewfinder (True Full Screen) ── */}
      <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/95">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-sm font-medium text-white/70 tracking-wide">
              Starting Camera…
            </span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-black/95 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d94452" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <p className="text-sm font-medium text-red-400">{error}</p>
            <p className="text-xs text-white/40 max-w-sm leading-relaxed">
              Please ensure camera permissions are allowed in your browser settings.
            </p>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="mt-2 px-6 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/80 font-medium text-sm transition-colors border border-white/10"
            >
              Close
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          }`}
        />

        {/* Subtle framing reticle */}
        {!loading && !error && (
          <div className="absolute inset-10 sm:inset-16 pointer-events-none rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/40 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/40 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/40 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/40 rounded-br-lg" />
          </div>
        )}
      </div>

      {/* ── Top Header Overlay ── */}
      <div className="relative z-30 pt-safe px-5 py-4 flex items-center justify-between" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }}>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 bg-black/30 backdrop-blur-md border border-white/10 hover:bg-black/50 transition-colors"
          aria-label="Close camera"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <span className="text-sm font-semibold text-white/80 tracking-wide">{title}</span>

        <button
          type="button"
          onClick={toggleFacingMode}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 bg-black/30 backdrop-blur-md border border-white/10 hover:bg-black/50 transition-colors"
          title="Flip Camera"
          aria-label="Flip camera"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {/* ── Bottom Controls Bar ── */}
      <div className="relative z-30 pb-safe px-6 py-8 flex items-center justify-center gap-10" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" }}>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="px-5 py-2 rounded-full text-xs font-medium text-white/60 hover:text-white/90 transition-colors"
        >
          Cancel
        </button>

        {/* Shutter Button */}
        <button
          type="button"
          disabled={loading || !!error}
          onClick={handleSnap}
          className="relative w-[72px] h-[72px] rounded-full border-[3px] border-white/90 flex items-center justify-center p-1 transition-transform active:scale-95 disabled:opacity-30 disabled:pointer-events-none group focus:outline-none"
          aria-label="Capture photo"
        >
          <div className="w-full h-full rounded-full bg-white group-active:scale-90 transition-transform" />
        </button>

        <button
          type="button"
          onClick={toggleFacingMode}
          className="px-5 py-2 rounded-full text-xs font-medium text-white/60 hover:text-white/90 transition-colors"
        >
          {facingMode === "environment" ? "Front" : "Rear"}
        </button>
      </div>
    </div>
  );
}
