// Photo input: JPEG or PNG only (sdk-facts 16). Any other type is refused
// before any call is made (R2.1). The photo is read as base64 so it can be
// given to the model as an inline part (sdk-facts 21), never as a URL.
import type { StoredPhoto } from "../storage/notes";
import { strings } from "./strings";

export const PHOTO_REFUSED = strings.record.photoRefused;

export type PhotoTypeCheck = { ok: true; mimeType: "image/jpeg" | "image/png" } | { ok: false; line: string };

export function checkPhotoType(mimeType: string): PhotoTypeCheck {
  if (mimeType === "image/jpeg" || mimeType === "image/png") return { ok: true, mimeType };
  return { ok: false, line: PHOTO_REFUSED };
}

export async function readPhoto(file: File): Promise<{ ok: true; photo: StoredPhoto } | { ok: false; line: string }> {
  const check = checkPhotoType(file.type);
  if (!check.ok) return check;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { ok: true, photo: { mimeType: check.mimeType, base64: btoa(binary) } };
}
