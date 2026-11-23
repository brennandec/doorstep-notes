// @vitest-environment happy-dom
// H20 R4: the figure paragraphs and the cold-start line sit in one closed "How this was measured" disclosure.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderNoteZone } from "../../src/app/zones/note";
import { emptyState, allFolded } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { coldStartLine } from "../../src/app/coldStart";
import { screenFigureLines } from "../../src/app/figureText";

const none = () => undefined;
const render = (record: boolean, patch: Parameters<typeof emptyState>[0] = {}) =>
  renderNoteZone(emptyState({ results: none, ...(record ? { record: structuredClone(inventedVisit.preparedRecord) } : {}), ...patch }), {} as never);

describe("How this was measured (H20 R4)", () => {
  for (const record of [false, true]) {
    const where = record ? "with a record" : "on the first screen";
    it(`is one closed details element ${where}`, () => {
      const zone = render(record);
      const all = zone.querySelectorAll('details[data-details="measured"]');
      expect(all).toHaveLength(1);
      const d = all[0] as HTMLDetailsElement;
      expect(d.open).toBe(false);
      expect(d.querySelector("summary")?.textContent).toBe("How this was measured");
      expect((strings.folds as Record<string, string>).measured).toBe("How this was measured");
    });

    it(`holds the cold-start line ${where}, and no copy of it outside`, () => {
      const zone = render(record);
      const lines = zone.querySelectorAll("[data-cold-start]");
      expect(lines).toHaveLength(1);
      expect(lines[0]!.closest('details[data-details="measured"]')).not.toBeNull();
      expect(lines[0]!.textContent).toBe(coldStartLine(none));
    });
  }

  it("holds the figure paragraphs, the same text as before, and none outside it", () => {
    const zone = render(true);
    const figures = zone.querySelector("[data-figures]")!;
    expect(figures.closest('details[data-details="measured"]')).not.toBeNull();
    const { one, two } = screenFigureLines(none);
    expect(zone.querySelector("[data-figure-one]")?.textContent).toBe(one);
    expect(zone.querySelector("[data-figure-two]")?.textContent).toBe(two);
    expect(zone.querySelector("[data-mask-section] [data-figures]")).toBeNull();
    expect(zone.querySelectorAll("[data-figures]")).toHaveLength(1);
  });

  it("opens when the state says it was opened", () => {
    const zone = render(true, { unfolded: { ...allFolded(), measured: true } } as never);
    expect((zone.querySelector('details[data-details="measured"]') as HTMLDetailsElement).open).toBe(true);
  });
});
