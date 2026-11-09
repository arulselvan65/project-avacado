import jsPDF from "jspdf";
import { supabase } from "./supabase";
import type { TreeReviewRecord } from "./reviewTypes";

/**
 * Image metadata interface for aspect-ratio preserved rendering.
 */
interface ImageInfo {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
}

/**
 * Loads an image from a URL into a high-resolution base64 data URL
 * without distortion or blurring.
 */
async function loadImageInfo(url: string): Promise<ImageInfo | null> {
  if (typeof window === "undefined" || !url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });

    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 600;

    // Preserve high resolution up to 1400px for crisp PDF printing
    const maxDim = 1400;
    let targetW = nw;
    let targetH = nh;
    if (targetW > maxDim || targetH > maxDim) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.94),
      width: nw,
      height: nh,
      aspectRatio: nw / nh,
    };
  } catch {
    return null;
  }
}

/**
 * Converts tile coordinates to tile image URL.
 * Tries Google Hybrid, falls back to Esri Satellite.
 */
async function fetchTileImage(x: number, y: number, zoom: number): Promise<HTMLImageElement | null> {
  const urls = [
    `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${zoom}`,
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`,
  ];

  for (const url of urls) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = url;
      });
      return img;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Generates a high-precision, zoomed-in (zoom 19) satellite map snapshot
 * where the tree coordinates are guaranteed to be in the exact center.
 */
async function generateZoomedMapSnapshot(lat: number, lng: number): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const canvas = document.createElement("canvas");
    const canvasW = 600;
    const canvasH = 450;
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Zoom level 19: high-resolution orchard level (~70m across)
    const zoom = 19;
    const n = Math.pow(2, zoom);
    const worldX = ((lng + 180) / 360) * n * 256;
    const latRad = (lat * Math.PI) / 180;
    const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;

    const canvasMinX = worldX - canvasW / 2;
    const canvasMinY = worldY - canvasH / 2;

    const minTileX = Math.floor(canvasMinX / 256);
    const maxTileX = Math.floor((canvasMinX + canvasW) / 256);
    const minTileY = Math.floor(canvasMinY / 256);
    const maxTileY = Math.floor((canvasMinY + canvasH) / 256);

    // Fill background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Fetch and stitch tiles
    const tilePromises: Promise<{ img: HTMLImageElement | null; dx: number; dy: number }>[] = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const dx = tx * 256 - canvasMinX;
        const dy = ty * 256 - canvasMinY;
        tilePromises.push(
          fetchTileImage(tx, ty, zoom).then((img) => ({ img, dx, dy }))
        );
      }
    }

    const tiles = await Promise.all(tilePromises);
    for (const t of tiles) {
      if (t.img) {
        ctx.drawImage(t.img, t.dx, t.dy, 256, 256);
      }
    }

    // Coordinates in dead center
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Draw precision crosshairs and pin
    // 1. Radar pulse ring
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239, 68, 68, 0.22)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
    ctx.fill();

    // 2. Crosshair fine reticles
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy);
    ctx.lineTo(cx - 12, cy);
    ctx.moveTo(cx + 12, cy);
    ctx.lineTo(cx + 36, cy);
    ctx.moveTo(cx, cy - 36);
    ctx.lineTo(cx, cy - 12);
    ctx.moveTo(cx, cy + 12);
    ctx.lineTo(cx, cy + 36);
    ctx.stroke();

    // 3. Pin drop needle & head
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner white dot
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Needle pointer triangle
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 3);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 5, cy - 3);
    ctx.closePath();
    ctx.fillStyle = "#ef4444";
    ctx.fill();

    // Coordinate pill banner at bottom
    ctx.fillStyle = "rgba(10, 12, 16, 0.9)";
    ctx.fillRect(0, canvasH - 36, canvasW, 36);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SATELLITE ORCHARD VIEW (ZOOM 19)", 16, canvasH - 14);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, canvasW - 16, canvasH - 14);

    return canvas.toDataURL("image/jpeg", 0.95);
  } catch {
    return null;
  }
}

/**
 * Draws an image with perfect aspect ratio (no stretching or blurring)
 * inside a defined bounding box.
 */
function drawFittedImage(
  doc: jsPDF,
  img: ImageInfo,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) {
  // Card frame
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "FD");

  const imgAspect = img.aspectRatio;
  const boxAspect = boxW / boxH;

  let renderW = boxW;
  let renderH = boxH;
  let renderX = boxX;
  let renderY = boxY;

  if (imgAspect > boxAspect) {
    // Image is wider than box -> fit width
    renderH = boxW / imgAspect;
    renderY = boxY + (boxH - renderH) / 2;
  } else {
    // Image is taller than box -> fit height
    renderW = boxH * imgAspect;
    renderX = boxX + (boxW - renderW) / 2;
  }

  doc.addImage(img.dataUrl, "JPEG", renderX, renderY, renderW, renderH, undefined, "FAST");
}

/**
 * Fallback empty frame when image is missing.
 */
function drawFallbackBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string
) {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);

  const lines = label.split("\n");
  lines.forEach((l, idx) => {
    doc.text(l, x + w / 2, y + h / 2 + (idx - (lines.length - 1) / 2) * 4, {
      align: "center",
    });
  });
}

/**
 * Generates and downloads the comprehensive Affected Trees PDF Report.
 */
export async function downloadAffectedTreesPdf(
  review: TreeReviewRecord,
  onProgress?: (msg: string) => void
): Promise<void> {
  const affectedTrees = review.items.filter((i) => i.status === "affected");

  onProgress?.("Initializing PDF document…");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // ─── Header & Cover Section ───────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 44, "F");

  // Accent Line
  doc.setFillColor(239, 68, 68); // Red-500
  doc.rect(0, 43, pageWidth, 2.5, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("AFFECTED TREES INSPECTION REPORT", margin, 17);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Review Title: ${review.title}  |  Inspection Date: ${review.review_date}`,
    margin,
    25
  );

  doc.text(
    `Farm Location: ${review.farm_location || "All Farms"}  |  Generated: ${new Date().toLocaleDateString("en-IN")}`,
    margin,
    31
  );

  // Clickable link to live application
  const dashboardUrl = "https://project-avacado-blush.vercel.app/";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(96, 165, 250); // Sky blue
  doc.textWithLink(`Live Dashboard: ${dashboardUrl}`, margin, 38, {
    url: dashboardUrl,
  });

  // ─── Summary Metrics Box ──────────────────────────────────────────────────
  let y = 52;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "FD");

  const statCols = [
    { label: "TOTAL INSPECTED", val: `${review.total_trees}` },
    { label: "HEALTHY (OK)", val: `${review.ok_count}` },
    { label: "AFFECTED TREES", val: `${affectedTrees.length}`, isAlert: true },
    { label: "INSPECTION STATUS", val: "COMPLETED" },
  ];

  const colW = contentWidth / statCols.length;
  statCols.forEach((col, idx) => {
    const cx = margin + idx * colW + colW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(col.label, cx, y + 7, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(col.isAlert ? 220 : 30, col.isAlert ? 38 : 41, col.isAlert ? 38 : 59);
    doc.text(col.val, cx, y + 16, { align: "center" });

    if (idx < statCols.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin + (idx + 1) * colW, y + 4, margin + (idx + 1) * colW, y + 18);
    }
  });

  y += 28;

  // ─── If No Affected Trees ────────────────────────────────────────────────
  if (affectedTrees.length === 0) {
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(margin, y, contentWidth, 35, 3, 3, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(22, 101, 52);
    doc.text("No Affected Trees Reported", margin + 10, y + 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      "All inspected trees were marked in healthy (OK) condition during this review cycle.",
      margin + 10,
      y + 24
    );

    doc.save(`Tree_Review_Report_${review.review_date}_${review.id}.pdf`);
    return;
  }

  // ─── Affected Trees Detailed Cards ──────────────────────────────────────
  for (let i = 0; i < affectedTrees.length; i++) {
    const tree = affectedTrees[i];
    onProgress?.(`Processing affected tree ${i + 1} of ${affectedTrees.length} (${tree.tree_id})…`);

    // Fetch all registered photos for this tree from Supabase DB
    const allDbPhotos: string[] = [];
    if (Array.isArray(tree.all_tree_photos)) {
      tree.all_tree_photos.forEach((u) => {
        if (u && typeof u === "string" && !allDbPhotos.includes(u)) allDbPhotos.push(u);
      });
    }

    if (allDbPhotos.length === 0) {
      try {
        const { data: dbRow } = await supabase
          .from("trees")
          .select("image_urls, variety_image_url")
          .eq("tree_id", tree.tree_id)
          .maybeSingle();

        if (dbRow) {
          if (Array.isArray(dbRow.image_urls)) {
            dbRow.image_urls.forEach((u: string) => {
              if (u && typeof u === "string" && !allDbPhotos.includes(u)) allDbPhotos.push(u);
            });
          }
          if (dbRow.variety_image_url) {
            const parts = dbRow.variety_image_url.split(",").map((s: string) => s.trim()).filter(Boolean);
            parts.forEach((u: string) => {
              if (!allDbPhotos.includes(u)) allDbPhotos.push(u);
            });
          }
        }
      } catch {}
    }

    if (allDbPhotos.length === 0 && tree.original_photo_url) {
      allDbPhotos.push(tree.original_photo_url);
    }

    // Determine layout and height
    const hasDbPhotos = allDbPhotos.length > 0;
    // Base card height: Header (14) + Top images (56) + DB photos row (44 if present) + Notes (26) + padding
    const cardH = hasDbPhotos ? 146 : 106;

    // Check if new page is needed
    if (y + cardH > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    const cardY = y;
    const treeLinkUrl = `https://project-avacado-blush.vercel.app/trees?search=${encodeURIComponent(tree.tree_id)}`;

    // Outer card container
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, cardY, contentWidth, cardH, 3, 3, "FD");

    // ─── Card Header Bar ──────────────────────────────────────────────────
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, cardY, contentWidth, 14, 3, 3, "F");
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, cardY + 14, margin + contentWidth, cardY + 14);

    // Red left accent pip
    doc.setFillColor(220, 38, 38);
    doc.roundedRect(margin, cardY, 3.5, 14, 2, 2, "F");

    // Tree ID & Metadata
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Tree ID: ${tree.tree_id}`, margin + 7, cardY + 9.5);

    // Badges: Type & Farm
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    doc.text("[DEFECT REPORTED]", margin + 46, cardY + 9.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const metaStr = `Type: ${tree.type.toUpperCase()}  |  ${tree.farm_location || "Attuvampatti"}  |  ${tree.latitude.toFixed(6)}, ${tree.longitude.toFixed(6)}`;
    doc.text(metaStr, margin + 86, cardY + 9.5);

    // ─── Clickable Button Pill: View on Dashboard ──────────────────────────
    const btnW = 38;
    const btnH = 8;
    const btnX = margin + contentWidth - btnW - 3;
    const btnY = cardY + 3;

    doc.setFillColor(37, 99, 235); // Royal Blue
    doc.roundedRect(btnX, btnY, btnW, btnH, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("↗ View on Dashboard", btnX + btnW / 2, btnY + 5.2, { align: "center" });

    // Active clickable hyperlink over button
    doc.link(btnX, btnY, btnW, btnH, { url: treeLinkUrl });

    // ─── Row 1: High Precision Satellite Map & Close-Up Defect Photo ───────
    const row1W = (contentWidth - 9) / 2; // ~86.5mm each
    const row1H = 46;
    const row1Y = cardY + 18;

    // 1. Zoomed Satellite Map (Zoom 19)
    const mapColX = margin + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1. PRECISE LOCATION (ZOOM 19 SATELLITE)", mapColX, row1Y + 3.5);

    const mapDataUrl = await generateZoomedMapSnapshot(tree.latitude, tree.longitude);
    if (mapDataUrl) {
      try {
        doc.addImage(mapDataUrl, "JPEG", mapColX, row1Y + 5.5, row1W, row1H);
      } catch {
        drawFallbackBox(doc, mapColX, row1Y + 5.5, row1W, row1H, "Map Tile");
      }
    } else {
      drawFallbackBox(
        doc,
        mapColX,
        row1Y + 5.5,
        row1W,
        row1H,
        `Coordinates:\n${tree.latitude.toFixed(6)}\n${tree.longitude.toFixed(6)}`
      );
    }

    // 2. Affected Point Defect Photo (with aspect-ratio preservation)
    const affColX = mapColX + row1W + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(220, 38, 38);
    doc.text("2. CLOSE-UP DEFECT PHOTO (AFFECTED POINT)", affColX, row1Y + 3.5);

    const affImgInfo = tree.affected_photo_url ? await loadImageInfo(tree.affected_photo_url) : null;
    if (affImgInfo) {
      drawFittedImage(doc, affImgInfo, affColX, row1Y + 5.5, row1W, row1H);
    } else {
      drawFallbackBox(doc, affColX, row1Y + 5.5, row1W, row1H, "No close-up defect\nphotograph attached");
    }

    // ─── Row 2: All Registered Tree Photos (from Database) ──────────────────
    let nextY = row1Y + row1H + 9;

    if (hasDbPhotos) {
      const displayPhotos = allDbPhotos.slice(0, 4);
      const dbColW = (contentWidth - 6 - (displayPhotos.length - 1) * 3) / displayPhotos.length;
      const dbColH = 32;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `3. REGISTERED TREE IMAGES IN DATABASE (${allDbPhotos.length} photo${allDbPhotos.length > 1 ? "s" : ""})`,
        margin + 3,
        nextY + 3.5
      );

      for (let pIdx = 0; pIdx < displayPhotos.length; pIdx++) {
        const pX = margin + 3 + pIdx * (dbColW + 3);
        const pInfo = await loadImageInfo(displayPhotos[pIdx]);
        if (pInfo) {
          drawFittedImage(doc, pInfo, pX, nextY + 5.5, dbColW, dbColH);
        } else {
          drawFallbackBox(doc, pX, nextY + 5.5, dbColW, dbColH, `Photo #${pIdx + 1}`);
        }
      }

      nextY += dbColH + 9;
    }

    // ─── Inspection Observations & Remarks Box ────────────────────────────
    const notesBoxH = 21;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin + 3, nextY, contentWidth - 6, notesBoxH, 2, 2, "FD");

    // Blue indicator on notes box
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(margin + 3, nextY, 2.5, notesBoxH, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("INSPECTION OBSERVATIONS & DEFECT DIAGNOSIS:", margin + 8, nextY + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const notesText =
      tree.affected_notes?.trim() ||
      "Tree flagged as affected during this inspection cycle. Immediate field verification and remediation recommended.";
    const splitNotes = doc.splitTextToSize(notesText, contentWidth - 18);
    doc.text(splitNotes, margin + 8, nextY + 11.5);

    // Direct Link line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.textWithLink(`Tree Details: ${treeLinkUrl}`, margin + 8, nextY + 18, {
      url: treeLinkUrl,
    });

    y = cardY + cardH + 7;
  }

  // ─── Page Numbers & Footer on All Pages ──────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${p} of ${totalPages}  |  Mages Farms Tree Review Tracking  |  https://project-avacado-blush.vercel.app/`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  onProgress?.("Downloading PDF…");
  doc.save(`Affected_Trees_Report_${review.review_date}_${review.id}.pdf`);
}
