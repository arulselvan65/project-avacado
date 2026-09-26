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
  image_urls: string[];
}

/**
 * The shape of data we send when inserting a new tree row.
 * Omits server-generated fields (id, created_at).
 */
export type TreeInsert = Omit<TreeRecord, "id" | "created_at">;
