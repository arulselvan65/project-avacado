/**
 * Shared TypeScript types for the trees table.
 * Matches the Supabase `trees` table schema exactly.
 */

export interface TreeRecord {
  id: string; // uuid
  created_at: string; // timestamptz (ISO string)
  tree_id: string;
  type: "tree" | "plant";
  variety: string | null;
  variety_image_url: string | null;
  latitude: number;
  longitude: number;
  is_fruiting: boolean;
  is_affected: boolean;
  is_pruned: boolean;
  note: string | null;
  farm_location: string | null;
  image_urls: string[];
}

/**
 * The shape of data we send when inserting a new tree row.
 * Omits server-generated fields (id, created_at).
 */
export type TreeInsert = Omit<TreeRecord, "id" | "created_at">;

/**
 * Helper to parse variety image URLs which may be stored as a single URL,
 * comma-separated URLs, or a JSON array string.
 */
export function getVarietyImageUrls(
  variety_image_url: string | null | undefined
): string[] {
  if (!variety_image_url) return [];
  if (variety_image_url.startsWith("[") && variety_image_url.endsWith("]")) {
    try {
      const parsed = JSON.parse(variety_image_url);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return variety_image_url
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
