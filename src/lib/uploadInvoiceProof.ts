import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { app, auth } from "@/lib/firebase-config";
import * as FileSystem from "expo-file-system";

const storage = getStorage(app);

/**
 * Upload a proof image to Firebase Storage using the REST API directly.
 * This avoids the Blob/ArrayBuffer issue in React Native (Hermes) with Firebase SDK v12.
 *
 * Path: schools/{schoolId}/invoices/{invoiceId}/proof.jpg
 */
export async function uploadInvoiceProof(
  localUri: string,
  schoolId: string,
  invoiceId: string
): Promise<string> {
  console.log("[uploadInvoiceProof] image uri=", localUri);

  const bucket = storage.app.options.storageBucket as string;
  const path = `schools/${schoolId}/invoices/${invoiceId}/proof.jpg`;
  const encodedPath = encodeURIComponent(path);

  console.log("[uploadInvoiceProof] storage path=", path);
  console.log("[uploadInvoiceProof] storage bucket=", bucket);

  // Read as base64
  console.log("[uploadInvoiceProof] reading file as base64");
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  console.log("[uploadInvoiceProof] base64 length=", base64.length);

  // Get current user auth token for the upload
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;

  // Use Firebase Storage REST API to upload the base64 data directly
  // This avoids the Blob/ArrayBuffer issue in Hermes
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

  const authHeader: Record<string, string> = token
    ? { Authorization: `Firebase ${token}` }
    : {};

  console.log("[uploadInvoiceProof] uploading via REST API");

  // Use expo-file-system's uploadAsync which handles binary correctly on RN
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": "image/jpeg",
      ...authHeader,
    },
  });

  console.log("[uploadInvoiceProof] upload status=", uploadResult.status);

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    console.error("[uploadInvoiceProof] upload failed, body=", uploadResult.body);
    throw new Error(`Upload failed with status ${uploadResult.status}: ${uploadResult.body}`);
  }

  console.log("[uploadInvoiceProof] upload success, getting download URL");

  // Get download URL via SDK (this is safe, it's just a GET request)
  const storageRef = ref(storage, path);
  const downloadURL = await getDownloadURL(storageRef);
  console.log("[uploadInvoiceProof] download URL=", downloadURL);
  return downloadURL;
}
