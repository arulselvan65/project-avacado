import { supabase } from "./supabase";

/**
 * Uploads a single file to the Supabase `tree-images` storage bucket.
 * Returns the public URL of the uploaded file.
 */
export async function uploadTreeImage(
  file: File,
  pathPrefix: string = "photos",
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

  if (error) {
    throw new Error(`Upload failed for ${file.name}: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("tree-images").getPublicUrl(path);

  return publicUrl;
}
