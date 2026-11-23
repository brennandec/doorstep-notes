// The raw note and the photo at rest, on this device only. They never leave
// the browser (brief rule 5).
import type { KeyValueBackend } from "./backend";

export interface StoredPhoto {
  mimeType: "image/jpeg" | "image/png";
  base64: string;
}

export interface NoteStore {
  saveNote(text: string): Promise<void>;
  loadNote(): Promise<string>;
  savePhoto(photo: StoredPhoto): Promise<void>;
  loadPhoto(): Promise<StoredPhoto | null>;
  clear(): Promise<void>;
}

export function makeNoteStore(backend: KeyValueBackend): NoteStore {
  return {
    async saveNote(text) { await backend.set("note", text); },
    async loadNote() {
      const v = await backend.get("note");
      return typeof v === "string" ? v : "";
    },
    async savePhoto(photo) { await backend.set("photo", photo); },
    async loadPhoto() {
      const v = (await backend.get("photo")) as Partial<StoredPhoto> | undefined;
      if (v && (v.mimeType === "image/jpeg" || v.mimeType === "image/png") && typeof v.base64 === "string") {
        return { mimeType: v.mimeType, base64: v.base64 };
      }
      return null;
    },
    async clear() {
      await backend.remove("note");
      await backend.remove("photo");
    },
  };
}
