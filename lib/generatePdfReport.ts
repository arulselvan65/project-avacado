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
 * in PORTRAIT (3:4) orientation matching camera photos, with the tree
 * coordinates guaranteed to be in the exact center.
 */
async function generateZoomedMapSnapshot(lat: number, lng: number): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const canvas = document.createElement("canvas");
    // 3:4 portrait canvas (450 x 600)
    const canvasW = 450;
    const canvasH = 600;
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
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239, 68, 68, 0.22)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
    ctx.fill();

    // 2. Crosshair fine reticles
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 40, cy);
    ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 14, cy);
    ctx.lineTo(cx + 40, cy);
    ctx.moveTo(cx - 40, cy);
    ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx, cy + 14);
    ctx.lineTo(cx, cy + 40);
    ctx.stroke();

    // 3. Pin drop needle & head
    ctx.beginPath();
    ctx.arc(cx, cy - 14, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner white dot
    ctx.beginPath();
    ctx.arc(cx, cy - 14, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Needle pointer triangle
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 4);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 6, cy - 4);
    ctx.closePath();
    ctx.fillStyle = "#ef4444";
    ctx.fill();

    // Coordinate pill banner at bottom
    ctx.fillStyle = "rgba(10, 12, 16, 0.92)";
    ctx.fillRect(0, canvasH - 36, canvasW, 36);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SATELLITE ORCHARD (Z19)", 14, canvasH - 14);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, canvasW - 14, canvasH - 14);

    return canvas.toDataURL("image/jpeg", 0.95);
  } catch {
    return null;
  }
}

/**
 * Draws an image with perfect aspect ratio (no stretching or blurring)
 * inside a defined portrait bounding box.
 */
function drawFittedImage(
  doc: jsPDF,
  img: ImageInfo,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) {
  // Background card frame
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "FD");

  const imgAspect = img.aspectRatio; // width / height
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

  // Re-stroke bounding border for crisp definition
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "D");
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
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);

  const lines = label.split("\n");
  lines.forEach((l, idx) => {
    doc.text(l, x + w / 2, y + h / 2 + (idx - (lines.length - 1) / 2) * 4, {
      align: "center",
    });
  });
}

/**
 * Evidence photo descriptor for structured portrait layout.
 */
interface EvidencePhoto {
  title: string;
  isDefect?: boolean;
  isMap?: boolean;
  dataUrl?: string | null;
  imgInfo?: ImageInfo | null;
  fallbackLabel: string;
}

/**
 * Generates and downloads the comprehensive Affected Trees PDF Report.
 * All photos are formatted in portrait orientation (3:4) matching smartphone field photography.
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
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm

  // ─── Header & Cover Section ───────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 42, "F");

  // Accent Red Line
  doc.setFillColor(239, 68, 68); // Red-500
  doc.rect(0, 41, pageWidth, 2, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("AFFECTED TREES INSPECTION REPORT", margin, 15);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Review Title: ${review.title}  |  Inspection Date: ${review.review_date}`,
    margin,
    22.5
  );

  doc.text(
    `Farm Location: ${review.farm_location || "All Farms"}  |  Report Generated: ${new Date().toLocaleDateString("en-IN")}`,
    margin,
    29
  );

  // Clickable link pill in top header
  const dashboardUrl = "https://project-avacado-blush.vercel.app/";
  const topBtnW = 44;
  const topBtnH = 8;
  const topBtnX = pageWidth - margin - topBtnW;
  const topBtnY = 22;

  doc.setFillColor(30, 41, 59); // slate-800
  doc.setDrawColor(59, 130, 246); // blue-500
  doc.roundedRect(topBtnX, topBtnY, topBtnW, topBtnH, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(147, 197, 253); // sky-300
  doc.text("Live Dashboard ↗", topBtnX + topBtnW / 2, topBtnY + 5.2, { align: "center" });
  doc.link(topBtnX, topBtnY, topBtnW, topBtnH, { url: dashboardUrl });

  // ─── Summary Metrics Box ──────────────────────────────────────────────────
  let y = 49;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 20, 2.5, 2.5, "FD");

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
    doc.text(col.label, cx, y + 6.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(col.isAlert ? 220 : 30, col.isAlert ? 38 : 41, col.isAlert ? 38 : 59);
    doc.text(col.val, cx, y + 14.5, { align: "center" });

    if (idx < statCols.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin + (idx + 1) * colW, y + 3.5, margin + (idx + 1) * colW, y + 16.5);
    }
  });

  y += 26;

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

  // ─── Affected Trees Detailed Cards (Portrait Photos) ─────────────────────
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

    // ─── Load All Image Assets in Parallel ─────────────────────────────────
    const [mapDataUrl, affImgInfo] = await Promise.all([
      generateZoomedMapSnapshot(tree.latitude, tree.longitude),
      tree.affected_photo_url ? loadImageInfo(tree.affected_photo_url) : Promise.resolve(null),
    ]);

    // Build the list of evidence photos
    const photoItems: EvidencePhoto[] = [];

    // 1. Zoomed Satellite Map (Portrait 3:4)
    photoItems.push({
      title: "1. LOCATION MAP (Z19)",
      isMap: true,
      dataUrl: mapDataUrl,
      fallbackLabel: `Coordinates:\n${tree.latitude.toFixed(6)}\n${tree.longitude.toFixed(6)}`,
    });

    // 2. Affected Point Defect Photo (Portrait 3:4)
    photoItems.push({
      title: "2. DEFECT CLOSE-UP",
      isDefect: true,
      imgInfo: affImgInfo,
      fallbackLabel: "No close-up defect\nphoto attached",
    });

    // 3. Registered Database Photos (Portrait 3:4)
    for (let pIdx = 0; pIdx < allDbPhotos.length; pIdx++) {
      const pInfo = await loadImageInfo(allDbPhotos[pIdx]);
      photoItems.push({
        title: `${photoItems.length + 1}. TREE PHOTO #${pIdx + 1}`,
        imgInfo: pInfo,
        fallbackLabel: `Photo #${pIdx + 1}`,
      });
    }

    // ─── Dynamic Column Grid Sizing in Portrait Mode ───────────────────────
    // If <= 3 items: 3 large portrait columns (56mm x 72mm)
    // If >= 4 items: 4 portrait columns (41.5mm x 55mm)
    const numCols = photoItems.length <= 3 ? 3 : 4;
    const colSpacing = 3;
    const availablePhotoW = contentWidth - 6; // 3mm padding each side
    const photoBoxW = (availablePhotoW - (numCols - 1) * colSpacing) / numCols;
    // 3:4 portrait ratio (height = width / 0.75)
    const photoBoxH = numCols === 3 ? 72 : 55;

    const numRows = Math.ceil(photoItems.length / numCols);
    const photoRowStride = 4.5 + photoBoxH + 4; // title (4.5) + box + gap (4)
    const totalPhotosH = numRows * photoRowStride;

    const headerH = 16;
    const notesBoxH = 20;
    const cardH = headerH + 3 + totalPhotosH + 2 + notesBoxH + 4;

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

    // ─── Card Header Bar (Height: 16mm) ───────────────────────────────────
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, cardY, contentWidth, headerH, 3, 3, "F");
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, cardY + headerH, margin + contentWidth, cardY + headerH);

    // Red left accent indicator strip
    doc.setFillColor(220, 38, 38);
    doc.roundedRect(margin, cardY, 3.5, headerH, 2, 2, "F");

    // Line 1: Tree ID & Alert Badge
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Tree ID: ${tree.tree_id}`, margin + 7, cardY + 6.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(220, 38, 38);
    doc.text("[DEFECT REPORTED]", margin + 45, cardY + 6.5);

    // Line 2: Metadata row (Variety, Type, Farm Location, GPS)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const metaParts = [
      tree.variety ? `Variety: ${tree.variety}` : "",
      `Type: ${tree.type.toUpperCase()}`,
      tree.farm_location || "Attuvampatti",
      `GPS: ${tree.latitude.toFixed(6)}, ${tree.longitude.toFixed(6)}`,
    ].filter(Boolean);
    doc.text(metaParts.join("  •  "), margin + 7, cardY + 12);

    // ─── Clickable Button Pill: View on Dashboard (Properly Aligned) ───────
    const btnW = 40;
    const btnH = 8.5;
    const btnX = margin + contentWidth - btnW - 3.5;
    const btnY = cardY + (headerH - btnH) / 2; // Exact vertical center: cardY + 3.75mm

    // Button frame with Royal Blue fill & Deep Blue border
    doc.setFillColor(37, 99, 235); // Royal Blue
    doc.setDrawColor(29, 78, 216); // Deep Blue border
    doc.roundedRect(btnX, btnY, btnW, btnH, 2.5, 2.5, "FD");

    // Centered button text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("View on Dashboard ↗", btnX + btnW / 2, btnY + 5.7, { align: "center" });

    // Active clickable hyperlink over button area
    doc.link(btnX, btnY, btnW, btnH, { url: treeLinkUrl });

    // ─── Portrait Photo Grid Rendering ─────────────────────────────────────
    const photosStartY = cardY + headerH + 3;

    for (let idx = 0; idx < photoItems.length; idx++) {
      const item = photoItems[idx];
      const rIdx = Math.floor(idx / numCols);
      const cIdx = idx % numCols;

      const boxX = margin + 3 + cIdx * (photoBoxW + colSpacing);
      const boxY = photosStartY + rIdx * photoRowStride + 4.5;

      // Title label above portrait photo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(item.isDefect ? 220 : 15, item.isDefect ? 38 : 23, item.isDefect ? 38 : 42);
      doc.text(item.title, boxX, boxY - 1.5);

      // Render Portrait Photo / Map Box
      if (item.isMap && item.dataUrl) {
        try {
          doc.addImage(item.dataUrl, "JPEG", boxX, boxY, photoBoxW, photoBoxH);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(boxX, boxY, photoBoxW, photoBoxH, 2, 2, "D");
        } catch {
          drawFallbackBox(doc, boxX, boxY, photoBoxW, photoBoxH, item.fallbackLabel);
        }
      } else if (item.imgInfo) {
        drawFittedImage(doc, item.imgInfo, boxX, boxY, photoBoxW, photoBoxH);
      } else {
        drawFallbackBox(doc, boxX, boxY, photoBoxW, photoBoxH, item.fallbackLabel);
      }
    }

    // ─── Inspection Observations & Remarks Box ────────────────────────────
    const notesY = photosStartY + totalPhotosH + 2;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin + 3, notesY, contentWidth - 6, notesBoxH, 2, 2, "FD");

    // Blue indicator stripe
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(margin + 3, notesY, 2.5, notesBoxH, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("INSPECTION OBSERVATIONS & DEFECT DIAGNOSIS:", margin + 8, notesY + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const notesText =
      tree.affected_notes?.trim() ||
      "Tree flagged as affected during this inspection cycle. Immediate field verification and remediation recommended.";
    const splitNotes = doc.splitTextToSize(notesText, contentWidth - 18);
    doc.text(splitNotes, margin + 8, notesY + 10.5);

    // Direct Link line at bottom
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(37, 99, 235);
    doc.textWithLink(`↗ View on Live Dashboard: ${treeLinkUrl}`, margin + 8, notesY + 16.5, {
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
