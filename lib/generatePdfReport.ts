import jsPDF from "jspdf";
import { supabase } from "./supabase";
import type { TreeReviewRecord, TreeReviewItem } from "./reviewTypes";

/**
 * Converts lat/lng to OpenStreetMap tile coordinates.
 */
function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/**
 * Generates a mini map snapshot data URL with a red pin at (lat, lng).
 */
async function generateMapSnapshot(lat: number, lng: number): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background terrain color
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 400, 300);

    // Try to load a real tile from Esri or OpenStreetMap
    const zoom = 17;
    const { x, y } = latLngToTile(lat, lng, zoom);
    const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = tileUrl;
      });
      ctx.drawImage(img, 0, 0, 400, 300);
    } catch {
      // If tile fetch fails (e.g. offline/CORS), draw a clean grid background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, 400, 300);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 400; i += 25) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 300);
        ctx.stroke();
      }
      for (let j = 0; j < 300; j += 25) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(400, j);
        ctx.stroke();
      }
    }

    // Draw Map Pin in center
    const cx = 200;
    const cy = 150;

    // Pin Shadow
    ctx.beginPath();
    ctx.ellipse(cx, cy + 16, 12, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();

    // Pin Needle & Head
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner White Dot
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Lat / Long coordinate label banner at bottom
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 260, 400, 40);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, 200, 285);

    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return null;
  }
}

/**
 * Loads an image from a URL into a base64 Data URL.
 */
async function urlToDataUrl(url: string): Promise<string | null> {
  if (typeof window === "undefined" || !url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 600;
    canvas.height = img.naturalHeight || 450;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
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
  doc.rect(0, 0, pageWidth, 42, "F");

  // Accent Line
  doc.setFillColor(239, 68, 68); // Red-500
  doc.rect(0, 41, pageWidth, 2.5, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("AFFECTED TREES INSPECTION REPORT", margin, 18);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Review: ${review.title}  |  Conducted Date: ${review.review_date}`,
    margin,
    26
  );

  doc.text(
    `Farm Location: ${review.farm_location || "All"}  |  Report Generated: ${new Date().toLocaleDateString("en-IN")}`,
    margin,
    32
  );

  // Clickable link to live application
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(96, 165, 250); // Sky blue
  const dashboardUrl = "https://project-avacado-blush.vercel.app/";
  doc.textWithLink("Live Dashboard: https://project-avacado-blush.vercel.app/", margin, 38, {
    url: dashboardUrl,
  });

  // ─── Summary Metrics Box ──────────────────────────────────────────────────
  let y = 50;

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "FD");

  const statCols = [
    { label: "TOTAL INSPECTED", val: `${review.total_trees}` },
    { label: "OK STATUS", val: `${review.ok_count}` },
    { label: "AFFECTED TREES", val: `${affectedTrees.length}`, isAlert: true },
    { label: "COMPLETION", val: "100%" },
  ];

  const colW = contentWidth / statCols.length;
  statCols.forEach((col, idx) => {
    const cx = margin + idx * colW + colW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(col.label, cx, y + 7, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(col.isAlert ? 220 : 30, col.isAlert ? 38 : 41, col.isAlert ? 38 : 59);
    doc.text(col.val, cx, y + 17, { align: "center" });

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
    doc.setFontSize(10);
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
  // Exactly 1 or 2 trees per page depending on size. Let's do 1 comprehensive tree record per page or clean 2-per-page.
  // With 3 images (Map, Original Tree Photo, Affected Point Photo), each card takes ~110mm height.
  // Exactly 2 cards fit per A4 page!

  for (let i = 0; i < affectedTrees.length; i++) {
    const tree = affectedTrees[i];
    onProgress?.(`Processing affected tree ${i + 1} of ${affectedTrees.length} (${tree.tree_id})…`);

    // Fetch all images for this tree from the database if not present
    let allDbPhotos: string[] = tree.all_tree_photos ? [...tree.all_tree_photos] : [];
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

    // Determine card layout and required height
    const hasMultipleDbPhotos = allDbPhotos.length > 1;
    const cardH = hasMultipleDbPhotos ? 148 : 112;

    // Check if new page is needed
    if (y + cardH > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }

    const cardY = y;
    const treeLinkUrl = `https://project-avacado-blush.vercel.app/trees?search=${encodeURIComponent(tree.tree_id)}`;

    // Card background & border
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, cardY, contentWidth, cardH, 3, 3, "FD");

    // Card Header Bar
    doc.setFillColor(254, 242, 242); // red-50
    doc.roundedRect(margin, cardY, contentWidth, 14, 3, 3, "F");
    doc.setDrawColor(254, 202, 202); // red-200
    doc.line(margin, cardY + 14, margin + contentWidth, cardY + 14);

    // Tree ID Badge & Clickable App Link
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(220, 38, 38);
    doc.text(`AFFECTED TREE: ${tree.tree_id}`, margin + 4, cardY + 9.5);

    // Clickable link pill to live app
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(37, 99, 235); // Blue
    const linkText = "🔗 View Details on App ↗";
    const linkTextW = doc.getTextWidth(linkText);
    const linkX = margin + 65;
    doc.textWithLink(linkText, linkX, cardY + 9.5, { url: treeLinkUrl });
    doc.link(linkX - 1, cardY + 3, linkTextW + 2, 8, { url: treeLinkUrl });

    // Type / Location metadata
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const metaStr = `Type: ${tree.type.toUpperCase()}  |  Farm: ${tree.farm_location || "Attuvampatti"}  |  GPS: ${tree.latitude.toFixed(6)}, ${tree.longitude.toFixed(6)}`;
    doc.text(metaStr, margin + contentWidth - 4, cardY + 9.5, { align: "right" });

    // ─── Render Images ────────────────────────────────────────────────────────
    if (!hasMultipleDbPhotos) {
      // 3 Columns: 1) Map, 2) Tree DB Photo, 3) Affected Point Photo
      const imgColW = (contentWidth - 12) / 3; // ~57mm each
      const imgH = 48; // mm
      const imgY = cardY + 18;

      // 1. Map Location Column
      const col1X = margin + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("1. LOCATION MAP", col1X, imgY + 4);

      const mapDataUrl = await generateMapSnapshot(tree.latitude, tree.longitude);
      if (mapDataUrl) {
        try {
          doc.addImage(mapDataUrl, "JPEG", col1X, imgY + 6, imgColW, imgH);
        } catch {
          drawFallbackBox(doc, col1X, imgY + 6, imgColW, imgH, "Map Tile");
        }
      } else {
        drawFallbackBox(doc, col1X, imgY + 6, imgColW, imgH, `Coordinates:\n${tree.latitude.toFixed(6)}\n${tree.longitude.toFixed(6)}`);
      }

      // 2. Tree DB Photo
      const col2X = col1X + imgColW + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("2. TREE PHOTO (MAIN DB)", col2X, imgY + 4);

      const dbPhotoUrl = allDbPhotos[0] ? await urlToDataUrl(allDbPhotos[0]) : null;
      if (dbPhotoUrl) {
        try {
          doc.addImage(dbPhotoUrl, "JPEG", col2X, imgY + 6, imgColW, imgH);
        } catch {
          drawFallbackBox(doc, col2X, imgY + 6, imgColW, imgH, "Tree Photo");
        }
      } else {
        drawFallbackBox(doc, col2X, imgY + 6, imgColW, imgH, "No photo in\nmain database");
      }

      // 3. Affected Point Photo
      const col3X = col2X + imgColW + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(220, 38, 38);
      doc.text("3. AFFECTED POINT PHOTO", col3X, imgY + 4);

      const affPhoto = tree.affected_photo_url ? await urlToDataUrl(tree.affected_photo_url) : null;
      if (affPhoto) {
        try {
          doc.addImage(affPhoto, "JPEG", col3X, imgY + 6, imgColW, imgH);
        } catch {
          drawFallbackBox(doc, col3X, imgY + 6, imgColW, imgH, "Affected Photo");
        }
      } else {
        drawFallbackBox(doc, col3X, imgY + 6, imgColW, imgH, "No affected point\nphoto provided");
      }

      // Notes Box
      const notesY = imgY + imgH + 8;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin + 3, notesY, contentWidth - 6, 22, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("INSPECTION REMARKS & DEFECT NOTES:", margin + 6, notesY + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      const notesText = tree.affected_notes?.trim() || "Tree flagged as affected during this inspection. Field diagnosis and remedial action recommended.";
      const splitNotes = doc.splitTextToSize(notesText, contentWidth - 14);
      doc.text(splitNotes, margin + 6, notesY + 11.5);

      // Direct Link inside card
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.textWithLink(`Tree Details: ${treeLinkUrl}`, margin + 6, notesY + 19, { url: treeLinkUrl });
    } else {
      // Multiple DB photos:
      // Row 1: Map (half width) + Affected Point Photo (half width)
      const halfColW = (contentWidth - 9) / 2; // ~86mm
      const row1H = 42;
      const row1Y = cardY + 18;

      // 1. Location Map
      const r1c1X = margin + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("1. LOCATION MAP", r1c1X, row1Y + 4);

      const mapDataUrl = await generateMapSnapshot(tree.latitude, tree.longitude);
      if (mapDataUrl) {
        try {
          doc.addImage(mapDataUrl, "JPEG", r1c1X, row1Y + 6, halfColW, row1H);
        } catch {
          drawFallbackBox(doc, r1c1X, row1Y + 6, halfColW, row1H, "Map Tile");
        }
      } else {
        drawFallbackBox(doc, r1c1X, row1Y + 6, halfColW, row1H, `Coordinates:\n${tree.latitude.toFixed(6)}\n${tree.longitude.toFixed(6)}`);
      }

      // 2. Affected Point Photo
      const r1c2X = r1c1X + halfColW + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(220, 38, 38);
      doc.text("2. AFFECTED POINT DEFECT PHOTO", r1c2X, row1Y + 4);

      const affPhoto = tree.affected_photo_url ? await urlToDataUrl(tree.affected_photo_url) : null;
      if (affPhoto) {
        try {
          doc.addImage(affPhoto, "JPEG", r1c2X, row1Y + 6, halfColW, row1H);
        } catch {
          drawFallbackBox(doc, r1c2X, row1Y + 6, halfColW, row1H, "Affected Photo");
        }
      } else {
        drawFallbackBox(doc, r1c2X, row1Y + 6, halfColW, row1H, "No affected point photo provided");
      }

      // Row 2: All DB Tree Images (up to 4 images side-by-side)
      const row2Y = row1Y + row1H + 8;
      const displayDbPhotos = allDbPhotos.slice(0, 4);
      const dbColW = (contentWidth - 6 - (displayDbPhotos.length - 1) * 3) / displayDbPhotos.length;
      const row2H = 34;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`3. TREE REGISTERED IMAGES IN MAIN DB (${allDbPhotos.length} photo${allDbPhotos.length > 1 ? "s" : ""})`, margin + 3, row2Y + 4);

      for (let pIdx = 0; pIdx < displayDbPhotos.length; pIdx++) {
        const pX = margin + 3 + pIdx * (dbColW + 3);
        const pUrl = await urlToDataUrl(displayDbPhotos[pIdx]);
        if (pUrl) {
          try {
            doc.addImage(pUrl, "JPEG", pX, row2Y + 6, dbColW, row2H);
          } catch {
            drawFallbackBox(doc, pX, row2Y + 6, dbColW, row2H, `Photo ${pIdx + 1}`);
          }
        } else {
          drawFallbackBox(doc, pX, row2Y + 6, dbColW, row2H, `Photo ${pIdx + 1}`);
        }
      }

      // Notes Box
      const notesY = row2Y + row2H + 8;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin + 3, notesY, contentWidth - 6, 24, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("INSPECTION REMARKS & DEFECT NOTES:", margin + 6, notesY + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      const notesText = tree.affected_notes?.trim() || "Tree flagged as affected during this inspection. Field diagnosis and remedial action recommended.";
      const splitNotes = doc.splitTextToSize(notesText, contentWidth - 14);
      doc.text(splitNotes, margin + 6, notesY + 11.5);

      // Direct Link inside card
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.textWithLink(`Tree Details: ${treeLinkUrl}`, margin + 6, notesY + 20, { url: treeLinkUrl });
    }

    y = cardY + cardH + 8;
  }

  // ─── Page Numbers on All Pages ──────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${p} of ${totalPages}  |  Mages Farms Field Review Tracking`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  onProgress?.("Downloading PDF…");
  doc.save(`Affected_Trees_Report_${review.review_date}_${review.id}.pdf`);
}

function drawFallbackBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string
) {
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(x, y, w, h, "FD");
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
