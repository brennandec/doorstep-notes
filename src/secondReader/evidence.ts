// Evidence check for the second reader (R2.1, R2.2). A quote the reader gives must
// be words that stand in the masked text. A quote that does not is dropped, so
// nothing is shown that she cannot find and tap. Comparison folds case and needs
// whole words. The quote kept is the text as it stands in the masked text.
// Runs on this device; no model, no request.
import { findWholeWords } from "../masking/fold";
import type { Guess } from "../inference/types";

export interface KeptEvidence {
  guesses: Guess[];
  /** how many quotes were dropped */
  dropped: number;
  /** there is at least one guess and no quote is left in any of them */
  allDropped: boolean;
}

export function keepEvidence(guesses: Guess[], maskedText: string): KeptEvidence {
  let dropped = 0;
  let kept = 0;
  const out = guesses.map((g) => {
    const evidence: string[] = [];
    for (const quote of g.evidence) {
      const wanted = quote.trim();
      const hit = wanted === "" ? undefined : findWholeWords(maskedText, wanted)[0];
      if (!hit) {
        dropped += 1;
        continue;
      }
      const asWritten = maskedText.slice(hit.start, hit.end);
      if (!evidence.includes(asWritten)) evidence.push(asWritten);
      kept += 1;
    }
    return { who: g.who, evidence };
  });
  return { guesses: out, dropped, allDropped: out.length > 0 && kept === 0 };
}
