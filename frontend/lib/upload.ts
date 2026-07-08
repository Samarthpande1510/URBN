import { api } from "@/lib/api";

/**
 * Downscale + convert to WebP in the browser so uploads land at ~100-300KB
 * instead of multi-MB originals. Falls back to the original file if the
 * browser can't decode/encode it.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function putToR2(file: Blob, folder: "products" | "npd", contentType: string): Promise<string> {
  const { upload_url, public_url } = (await api.files.presign(folder, contentType)) as {
    upload_url: string;
    public_url: string;
  };
  const res = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) throw new Error("File upload failed — please try again.");
  return public_url;
}

/**
 * Upload a file to R2 and return its public URL.
 * Images are compressed to WebP first; PDFs and other files upload as-is.
 */
export async function uploadFile(file: File, folder: "products" | "npd"): Promise<string> {
  if (file.type.startsWith("image/")) {
    const compressed = await compressImage(file);
    return putToR2(compressed, folder, compressed.type || "image/webp");
  }
  return putToR2(file, folder, file.type || "application/pdf");
}
