import { describe, expect, it } from "vitest";
import { PHOTO_REFUSED, checkPhotoType, readPhoto } from "../../src/app/photo";

describe("photo type check", () => {
  it("accepts JPEG and PNG", () => {
    expect(checkPhotoType("image/jpeg")).toEqual({ ok: true, mimeType: "image/jpeg" });
    expect(checkPhotoType("image/png")).toEqual({ ok: true, mimeType: "image/png" });
  });
  it("refuses GIF, PDF and HEIC with the exact line", () => {
    for (const t of ["image/gif", "application/pdf", "image/heic", "image/heif", "", "text/plain"]) {
      const r = checkPhotoType(t);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.line).toBe("Only JPEG or PNG photos can be read on this device. Convert it to JPEG or PNG first.");
        expect(r.line).toBe(PHOTO_REFUSED);
        expect(r.line).toContain("Convert it to JPEG or PNG first.");
      }
    }
  });
  it("reads a file into base64 with its type, and refuses a wrong type before reading", async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], "page.png", { type: "image/png" });
    const r = await readPhoto(png);
    expect(r).toEqual({ ok: true, photo: { mimeType: "image/png", base64: "iVBORw==" } });
    const gif = new File([new Uint8Array([1])], "page.gif", { type: "image/gif" });
    expect((await readPhoto(gif)).ok).toBe(false);
  });
});
