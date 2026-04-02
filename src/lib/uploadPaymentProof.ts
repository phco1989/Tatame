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
 * Upload a payment proof image via the backend to Vibecode storage.
 */
export async function uploadPaymentProof(uri: string): Promise<UploadResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  if (!uri) throw new Error("Missing image URI");

  const filename = `payment-proof-${uid}-${Date.now()}.jpg`;

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
    console.error("[PaymentProof] Upload error:", json);
    throw new Error(json?.error || "Upload failed");
  }

  console.log("[PaymentProof] Upload success:", json.data?.url);
  return {
    id: json.data.id,
    url: json.data.url,
    originalFilename: json.data.originalFilename,
    contentType: json.data.contentType,
    sizeBytes: json.data.sizeBytes,
  };
}
