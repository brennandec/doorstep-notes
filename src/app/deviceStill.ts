// A still of a real device run, shown when the model is not on this computer.
// Date and browser: results/screens.json key 10-whole-journey-device.
// Run file: results/hybrid-run-2026-11-14-h16.json, which names this picture.
import stillUrl from "../../docs/screens/10-whole-journey-device.png";
import { el } from "./dom";

export const deviceRunStill = {
  src: stillUrl,
  date: "2026-11-14",
  browser: "Google Chrome 157.0.8103.79",
  runFile: "results/hybrid-run-2026-11-14-h16.json",
  picture: "docs/screens/10-whole-journey-device.png",
} as const;

export function deviceStillCaption(): string {
  return `${deviceRunStill.date}. ${deviceRunStill.browser}. ${deviceRunStill.runFile}`;
}

export function deviceRunFigure(): HTMLElement {
  const caption = deviceStillCaption();
  return el(
    "figure",
    { class: "device-still", "data-device-still": "" },
    el("img", { src: deviceRunStill.src, alt: caption, "data-still-picture": deviceRunStill.picture }),
    el("figcaption", { "data-still-label": "" }, caption),
  );
}
