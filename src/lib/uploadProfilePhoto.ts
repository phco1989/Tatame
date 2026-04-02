import { auth } from "@/lib/firebase-config";

const BACKEND_URL = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL!;

export type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Upload a profile photo via the backend to Vibecode storage.
 * Returns the file metadata including CDN URL and file ID (for deletion).
 */
export async function uploadProfilePhoto(uri: string): Promise<UploadResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  if (!uri) throw new Error("Missing image URI");

  const filename = `avatar-${uid}-${Date.now()}.jpg`;

  const formData = new FormData();
  formData.append("file", {
    uri,
    type: "image/jpeg",
    name: filename,
  } as any);

  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });

  const json = await response.json();

  if (!response.ok) {
    console.error("[Profile] Upload error:", json);
    throw new Error(json?.error || "Upload failed");
  }

  console.log("[Profile] Photo upload success:", json.data?.url);
  return {
    id: json.data.id,
    url: json.data.url,
    originalFilename: json.data.originalFilename,
    contentType: json.data.contentType,
    sizeBytes: json.data.sizeBytes,
  };
}

/**
 * Delete a profile photo from Vibecode storage by file ID.
 */
export async function deleteProfilePhoto(fileId: string): Promise<void> {
  if (!fileId) return;

  const response = await fetch(`${BACKEND_URL}/api/files/${fileId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const json = await response.json();
    console.error("[Profile] Delete error:", json);
    throw new Error(json?.error || "Delete failed");
  }

  console.log("[Profile] Photo deleted:", fileId);
}
