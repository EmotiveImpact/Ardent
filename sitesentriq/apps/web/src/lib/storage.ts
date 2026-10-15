import { supabase } from '@/lib/supabase'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

/**
 * Upload a file to Supabase Storage.
 * In DEV_MODE (no Supabase configured), returns a mock URL and logs to console.
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  opts?: { upsert?: boolean },
): Promise<string> {
  if (DEV_MODE) {
    console.log(`[DEV_MODE] uploadFile: bucket="${bucket}", path="${path}", file="${file.name}" (${file.size} bytes)`)
    return `https://placeholder.supabase.co/storage/v1/object/public/${bucket}/${path}`
  }

  // `upsert` lets the offline-queue drain overwrite the same deterministic path
  // on retry instead of erroring on a duplicate object (idempotent re-sync).
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: opts?.upsert ?? false })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Get the public URL for a file in Supabase Storage.
 * In DEV_MODE, returns a mock URL.
 */
export function getFileUrl(bucket: string, path: string): string {
  if (DEV_MODE) {
    console.log(`[DEV_MODE] getFileUrl: bucket="${bucket}", path="${path}"`)
    return `https://placeholder.supabase.co/storage/v1/object/public/${bucket}/${path}`
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Delete a file from Supabase Storage.
 * In DEV_MODE, logs to console and returns successfully.
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  if (DEV_MODE) {
    console.log(`[DEV_MODE] deleteFile: bucket="${bucket}", path="${path}"`)
    return
  }

  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}
