import { supabase } from "./supabase";
import type { TreeRecord } from "./types";
import type {
  TreeReviewRecord,
  TreeReviewItem,
  ReviewMetadata,
} from "./reviewTypes";

const LOCAL_STORAGE_KEY_INDEX = "mages_farm_reviews_index";
const LOCAL_STORAGE_PREFIX = "mages_farm_review_";
const LOCAL_STORAGE_DELETED_KEY = "mages_farm_deleted_reviews_tombstones";
const STORAGE_BUCKET = "tree-images";
const STORAGE_PREFIX = "reviews_data/records";
const STORAGE_TOMBSTONES_PREFIX = "reviews_data/tombstones";

/**
 * Calculates summary metrics for a list of review items.
 */
export function calculateReviewMetrics(items: TreeReviewItem[]) {
  const total = items.length;
  const ok = items.filter((i) => i.status === "ok").length;
  const affected = items.filter((i) => i.status === "affected").length;
  const unreviewed = items.filter(
    (i) => i.status === null || i.status === undefined
  ).length;
  return {
    total_trees: total,
    ok_count: ok,
    affected_count: affected,
    unreviewed_count: unreviewed,
  };
}

/**
 * Uploads a photo of the affected point to Supabase storage.
 */
export async function uploadAffectedPointPhoto(
  file: File,
  reviewId: string,
  treeId: string
): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `reviews/${reviewId}/${treeId}_affected_${timestamp}_${safeName}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) {
    throw new Error(`Upload failed for affected photo: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  return publicUrl;
}

/**
 * Loads deleted review IDs set from local storage and cloud tombstones.
 */
async function getDeletedReviewIds(): Promise<Set<string>> {
  const deletedSet = new Set<string>();

  // 1. From localStorage
  if (typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_DELETED_KEY);
      if (local) {
        const arr = JSON.parse(local) as string[];
        if (Array.isArray(arr)) {
          arr.forEach((id) => deletedSet.add(id));
        }
      }
    } catch {}
  }

  // 2. From Supabase storage tombstones directory
  try {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(STORAGE_TOMBSTONES_PREFIX, { limit: 200 });

    if (Array.isArray(files) && files.length > 0) {
      files.forEach((f) => {
        if (f.name.endsWith(".json")) {
          const revId = f.name.replace(/\.json$/, "");
          deletedSet.add(revId);
        }
      });

      // Sync back to local storage
      if (typeof window !== "undefined") {
        localStorage.setItem(
          LOCAL_STORAGE_DELETED_KEY,
          JSON.stringify(Array.from(deletedSet))
        );
      }
    }
  } catch (err) {
    console.warn("Could not list tombstones from Supabase:", err);
  }

  return deletedSet;
}

/**
 * Fetches all review metadata entries (history list).
 * Merges local storage and cloud records, strictly filtering out deleted reviews.
 */
export async function getAllReviews(): Promise<ReviewMetadata[]> {
  const reviewsMap = new Map<string, ReviewMetadata>();
  const deletedSet = await getDeletedReviewIds();

  // 1. Load from localStorage first (instant response)
  if (typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY_INDEX);
      if (local) {
        const list = JSON.parse(local) as ReviewMetadata[];
        if (Array.isArray(list)) {
          list.forEach((r) => {
            if (!deletedSet.has(r.id)) {
              reviewsMap.set(r.id, r);
            }
          });
        }
      }
    } catch (e) {
      console.warn("Failed to read local reviews index:", e);
    }
  }

  // 2. Fetch latest file list from Supabase storage
  try {
    const { data: files, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(STORAGE_PREFIX, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

    if (!error && Array.isArray(files) && files.length > 0) {
      // Group files by reviewId, finding the latest timestamp for each
      const latestFilePerReview = new Map<string, string>();

      for (const file of files) {
        if (!file.name.endsWith(".json")) continue;
        // filename is `${reviewId}_${timestamp}.json`
        const lastUnderscore = file.name.lastIndexOf("_");
        if (lastUnderscore === -1) continue;
        const reviewId = file.name.substring(0, lastUnderscore);

        // Skip deleted reviews
        if (deletedSet.has(reviewId)) continue;

        const currentLatest = latestFilePerReview.get(reviewId);
        if (!currentLatest || file.name > currentLatest) {
          latestFilePerReview.set(reviewId, file.name);
        }
      }

      // Download any reviews not in local cache or refresh
      for (const [reviewId, fileName] of latestFilePerReview.entries()) {
        try {
          const { data: blob } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(`${STORAGE_PREFIX}/${fileName}`);

          if (blob) {
            const text = await blob.text();
            const rec = JSON.parse(text) as TreeReviewRecord;
            const meta: ReviewMetadata = {
              id: rec.id,
              title: rec.title,
              review_date: rec.review_date,
              status: rec.status,
              created_at: rec.created_at,
              completed_at: rec.completed_at,
              farm_location: rec.farm_location,
              total_trees: rec.total_trees,
              ok_count: rec.ok_count,
              affected_count: rec.affected_count,
              unreviewed_count: rec.unreviewed_count,
            };
            reviewsMap.set(reviewId, meta);

            if (typeof window !== "undefined") {
              localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${reviewId}`, text);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn("Could not list reviews from Supabase storage:", err);
  }

  // Clean out any tombstones from reviewsMap
  for (const delId of deletedSet) {
    reviewsMap.delete(delId);
  }

  const result = Array.from(reviewsMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Update local index cache
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_STORAGE_KEY_INDEX, JSON.stringify(result));
  }

  return result;
}

/**
 * Fetches an individual review with all items by ID.
 */
export async function getReviewById(id: string): Promise<TreeReviewRecord | null> {
  // Check if tombstoned locally
  if (typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_DELETED_KEY);
      if (local && (JSON.parse(local) as string[]).includes(id)) {
        return null;
      }
    } catch {}
  }

  let localReview: TreeReviewRecord | null = null;

  // 1. Check localStorage first
  if (typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${id}`);
      if (local) {
        localReview = JSON.parse(local) as TreeReviewRecord;
      }
    } catch {}
  }

  // 2. Fetch latest version from Supabase storage
  try {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(STORAGE_PREFIX, { search: id });

    if (Array.isArray(files) && files.length > 0) {
      // Find matching files starting with `${id}_`
      const matching = files
        .filter((f) => f.name.startsWith(`${id}_`) && f.name.endsWith(".json"))
        .sort((a, b) => b.name.localeCompare(a.name));

      if (matching.length > 0) {
        const latestFileName = matching[0].name;
        const { data: blob } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(`${STORAGE_PREFIX}/${latestFileName}`);

        if (blob) {
          const text = await blob.text();
          const cloudReview = JSON.parse(text) as TreeReviewRecord;
          if (typeof window !== "undefined") {
            localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${id}`, text);
          }
          return cloudReview;
        }
      }
    }
  } catch (err) {
    console.warn(`Could not fetch review ${id} from Supabase:`, err);
  }

  return localReview;
}

/**
 * Saves a review (full or partial).
 * Recomputes metrics, saves to localStorage synchronously, and uploads an immutable version to Supabase.
 */
export async function saveReviewRecord(review: TreeReviewRecord): Promise<TreeReviewRecord> {
  const metrics = calculateReviewMetrics(review.items);
  const updatedReview: TreeReviewRecord = {
    ...review,
    ...metrics,
  };

  const jsonString = JSON.stringify(updatedReview, null, 2);

  // 1. Immediate local persistence (guarantees data is never lost)
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${review.id}`, jsonString);

      // Update index in localStorage
      const localIndexStr = localStorage.getItem(LOCAL_STORAGE_KEY_INDEX);
      let list: ReviewMetadata[] = localIndexStr ? JSON.parse(localIndexStr) : [];
      const meta: ReviewMetadata = {
        id: updatedReview.id,
        title: updatedReview.title,
        review_date: updatedReview.review_date,
        status: updatedReview.status,
        created_at: updatedReview.created_at,
        completed_at: updatedReview.completed_at,
        farm_location: updatedReview.farm_location,
        total_trees: metrics.total_trees,
        ok_count: metrics.ok_count,
        affected_count: metrics.affected_count,
        unreviewed_count: metrics.unreviewed_count,
      };

      const existingIdx = list.findIndex((r) => r.id === updatedReview.id);
      if (existingIdx >= 0) {
        list[existingIdx] = meta;
      } else {
        list = [meta, ...list];
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_INDEX, JSON.stringify(list));
    } catch (e) {
      console.warn("LocalStorage save error:", e);
    }
  }

  // 2. Upload immutable version to Supabase storage (always uses new unique file name)
  try {
    const timestamp = Date.now();
    const fileName = `${updatedReview.id}_${timestamp}.json`;
    const buffer = new Blob([jsonString], { type: "application/json" });

    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(`${STORAGE_PREFIX}/${fileName}`, buffer, {
        contentType: "application/json",
        upsert: false,
      });
  } catch (err) {
    console.error("Supabase cloud storage sync error:", err);
  }

  return updatedReview;
}

/**
 * Creates a new review by fetching existing trees from the main Supabase database.
 * Does NOT duplicate tree records. Automatically records today's date.
 */
export async function createNewReviewFromDatabase(options: {
  title?: string;
  farm_location?: string;
}): Promise<TreeReviewRecord> {
  // 1. Fetch trees from the main Supabase table
  let query = supabase.from("trees").select("*").order("tree_id", { ascending: true });

  if (options.farm_location && options.farm_location !== "All") {
    query = query.eq("farm_location", options.farm_location);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load trees from database: ${error.message}`);
  }

  const trees = (data as TreeRecord[]) || [];
  if (trees.length === 0) {
    throw new Error(
      `No trees found in database${options.farm_location && options.farm_location !== "All" ? ` for ${options.farm_location}` : ""}.`
    );
  }

  // 2. Format review date (today's date)
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timestamp = now.getTime();
  const id = `REV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${timestamp.toString().slice(-4)}`;

  const locLabel = options.farm_location && options.farm_location !== "All" ? options.farm_location : "All Farms";
  const defaultTitle = `Field Review – ${locLabel} (${dateStr})`;

  // Ensure review title is strictly unique across all reviews
  const allExistingReviews = await getAllReviews();
  let title = options.title?.trim() || defaultTitle;

  if (options.title?.trim()) {
    const exists = allExistingReviews.some(
      (r) => r.title.toLowerCase().trim() === title.toLowerCase().trim()
    );
    if (exists) {
      throw new Error(`A review named "${title}" already exists. Review names must be unique.`);
    }
  } else {
    let counter = 1;
    let testTitle = defaultTitle;
    while (allExistingReviews.some((r) => r.title.toLowerCase().trim() === testTitle.toLowerCase().trim())) {
      counter++;
      testTitle = `${defaultTitle} (#${counter})`;
    }
    title = testTitle;
  }

  // 3. Map tree records into review items with status: null
  const items: TreeReviewItem[] = trees.map((t) => {
    let originalPhoto: string | null = null;
    const allPhotos: string[] = [];

    if (Array.isArray(t.image_urls)) {
      t.image_urls.forEach((u) => {
        if (typeof u === "string" && u.trim()) allPhotos.push(u.trim());
      });
    }

    if (t.variety_image_url) {
      const parts = t.variety_image_url.split(",").map((s) => s.trim()).filter(Boolean);
      parts.forEach((p) => {
        if (!allPhotos.includes(p)) allPhotos.push(p);
      });
    }

    if (allPhotos.length > 0) {
      originalPhoto = allPhotos[0];
    }

    return {
      tree_id: t.tree_id,
      db_id: t.id,
      type: t.type,
      variety: t.variety,
      farm_location: t.farm_location,
      latitude: t.latitude,
      longitude: t.longitude,
      original_photo_url: originalPhoto,
      all_tree_photos: allPhotos,
      status: null,
      affected_photo_url: null,
      affected_notes: null,
      reviewed_at: null,
    };
  });

  const newReview: TreeReviewRecord = {
    id,
    title,
    review_date: dateStr,
    status: "in_progress",
    created_at: now.toISOString(),
    completed_at: null,
    farm_location: options.farm_location || "All",
    total_trees: items.length,
    ok_count: 0,
    affected_count: 0,
    unreviewed_count: items.length,
    items,
  };

  // 4. Save and return
  await saveReviewRecord(newReview);
  return newReview;
}

/**
 * Deletes a review from storage permanently.
 * Removes from local storage, marks with a cloud tombstone, and attempts best-effort storage cleanup.
 */
export async function deleteReviewRecord(id: string): Promise<void> {
  // 1. Immediately delete from local storage and record tombstone
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${id}`);
      
      const localIndexStr = localStorage.getItem(LOCAL_STORAGE_KEY_INDEX);
      if (localIndexStr) {
        const list = (JSON.parse(localIndexStr) as ReviewMetadata[]).filter((r) => r.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY_INDEX, JSON.stringify(list));
      }

      const deletedStr = localStorage.getItem(LOCAL_STORAGE_DELETED_KEY);
      const list: string[] = deletedStr ? JSON.parse(deletedStr) : [];
      if (!list.includes(id)) {
        list.push(id);
      }
      localStorage.setItem(LOCAL_STORAGE_DELETED_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("LocalStorage delete warning:", e);
    }
  }

  // 2. Upload cloud tombstone marker to Supabase storage
  try {
    const tombstonePayload = JSON.stringify({
      id,
      deleted_at: new Date().toISOString(),
    });
    const blob = new Blob([tombstonePayload], { type: "application/json" });
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(`${STORAGE_TOMBSTONES_PREFIX}/${id}.json`, blob, {
        contentType: "application/json",
        upsert: false,
      });
  } catch (err) {
    console.warn("Could not upload tombstone marker to Supabase:", err);
  }

  // 3. Best-effort remove from storage
  try {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(STORAGE_PREFIX, { search: id });

    if (Array.isArray(files) && files.length > 0) {
      const pathsToDelete = files
        .filter((f) => f.name.startsWith(`${id}_`))
        .map((f) => `${STORAGE_PREFIX}/${f.name}`);

      if (pathsToDelete.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(pathsToDelete);
      }
    }
  } catch (err) {
    console.warn("Best effort storage remove:", err);
  }
}
