// SHA-256 of the outgoing bytes, as lower case hex (egress-check R7.1, Rule 1).
// Web Crypto only. Nothing else is hashed and nothing is chained.

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
