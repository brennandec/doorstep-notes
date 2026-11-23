/** Registers the shell's service worker once. If the page has already finished loading, it registers at once; else on load. Returns nothing and never throws. */
export function registerWorker(env: {
  prod: boolean;
  doc: Pick<Document, "readyState">;
  win: Pick<Window, "addEventListener">;
  nav: { serviceWorker?: { register(url: string): Promise<unknown> } };
  note: (state: string) => void;
}): "now" | "on-load" | "off" {
  const sw = env.nav.serviceWorker;
  if (!env.prod || !sw) {
    env.note("off");
    return "off";
  }
  const go = () =>
    void sw.register("/sw.js").then(
      () => env.note("registered"),
      (error: unknown) => {
        const name = error instanceof Error ? error.name : typeof (error as { name?: unknown })?.name === "string" ? String((error as { name: string }).name) : "unknown";
        env.note("failed: " + name);
      },
    );
  if (env.doc.readyState === "complete") {
    go();
    return "now";
  }
  env.win.addEventListener("load", go, { once: true });
  return "on-load";
}
