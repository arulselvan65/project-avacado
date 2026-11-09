/**
 * Types for the Tree Review Tracking module.
 */

export type ReviewItemStatus = "ok" | "affected" | null;

export interface TreeReviewItem {
  tree_id: string; // e.g. "A-001"
  db_id: string; // Supabase row UUID in trees table
  type: "tree" | "plant" | "regrown" | "dead";
  variety: string | null;
  farm_location: string | null;
  latitude: number;
  longitude: number;
  original_photo_url: string | null; // from main DB image_urls[0] or variety_image_url
  all_tree_photos?: string[]; // all DB field & variety photos
  
  // Review specific details:
  status: ReviewItemStatus; // "ok" | "affected" | null
  affected_photo_url?: string | null; // photo of the affected point (primary or backward compatible)
  affected_photo_urls?: string[]; // multiple photos of the affected point
  affected_notes?: string | null; // notes regarding the affected point
  reviewed_at?: string | null; // ISO string
}

/**
 * Returns all affected photo URLs for an item as an array.
 * Handles both `affected_photo_urls` array and `affected_photo_url` string.
 */
export function getAffectedPhotoUrls(item: {
  affected_photo_url?: string | null;
  affected_photo_urls?: string[];
}): string[] {
  if (Array.isArray(item.affected_photo_urls) && item.affected_photo_urls.length > 0) {
    return item.affected_photo_urls.filter(Boolean);
  }
  if (item.affected_photo_url) {
    return item.affected_photo_url
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export type ReviewStatus = "in_progress" | "completed";

export interface TreeReviewRecord {
  id: string; // e.g. "REV-20261109-A01"
  title: string; // e.g. "Field Review #1 - Attuvampatti"
  review_date: string; // YYYY-MM-DD
  status: ReviewStatus; // "in_progress" | "completed"
  created_at: string; // ISO string
  completed_at?: string | null;
  
  farm_location?: string | null; // "All" | "Attuvampatti" | "Gundupatti"
  total_trees: number;
  ok_count: number;
  affected_count: number;
  unreviewed_count: number;
  
  // All trees under this review
  items: TreeReviewItem[];
}

export interface ReviewMetadata {
  id: string;
  title: string;
  review_date: string;
  status: ReviewStatus;
  created_at: string;
  completed_at?: string | null;
  farm_location?: string | null;
  total_trees: number;
  ok_count: number;
  affected_count: number;
  unreviewed_count: number;
}
