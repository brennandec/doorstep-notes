// Visible words and controls for the WO-08 limits. A word is a whitespace token
// that contains a letter or a digit. Hidden, script, style and screen-reader-only
// text is not counted. The same function is what the script and the unit test call.

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

function hidden(node: Node): boolean {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    if (el.classList.contains("sr-only")) return true;
    const style = el.getAttribute("style") ?? "";
    if (/display\s*:\s*none/i.test(style)) return true;
    el = el.parentElement;
  }
  return false;
}

export interface ScreenMeasure {
  words: number;
  controls: number;
  text: string;
  egress: boolean;
}

/** Counts what a person can see in `root`. */
export function measureRoot(root: ParentNode): ScreenMeasure {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (!hidden(current)) {
      const chunk = current.textContent ?? "";
      if (chunk.trim() !== "") parts.push(chunk);
    }
    current = walker.nextNode();
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  const words = text === "" ? 0 : text.split(/\s+/).filter((token) => /[A-Za-z0-9]/.test(token)).length;
  const controls = [...root.querySelectorAll("button, input, textarea, select, a[href]")].filter((el) => !hidden(el)).length;
  return { words, controls, text, egress: /egress/i.test(text) };
}
