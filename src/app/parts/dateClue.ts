// The date clue on the text that would leave. Same sentence and same button as the place clue.
import { dateFlag } from "../../record/noteDate";
import { el } from "../dom";
import { fill, strings } from "../strings";
import { button } from "./button";

/** The sentence and Mask this clue, or nothing when the text holds no flagged date. */
export function dateClueNodes(text: string, onMask?: (phrase: string) => void): HTMLElement[] {
  const flag = dateFlag(text);
  if (flag === null) return [];
  const clue = button(strings.firstRun.maskClue, "secondary", { id: "mask-clue" });
  clue.setAttribute("data-quoted-clue", flag.phrase);
  clue.addEventListener("click", () => onMask?.(flag.phrase));
  return [el("p", { class: "masks-clue" }, fill(strings.firstRun.stillWritten, { what: flag.what })), clue];
}
