// H33: the full address of a served file on the hosted page. The browser context of the
// device fixture has no base address, so a path alone is refused before it leaves the machine.

/** The https origin of `pageUrl` joined with `path`. Throws when either is not usable. */
export function hostedAddress(pageUrl: string, path: string): string {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    throw new Error("hosted address refused: the page is not on an https origin");
  }
  if (url.protocol !== "https:") throw new Error("hosted address refused: the page is not on an https origin");
  if (!path.startsWith("/")) throw new Error("hosted address refused: the path must start with /");
  return url.origin + path;
}
