// One text (third review, X3). The box in zone 2 shows the string that Send gives the job.
// At the moment of Send the string held for sending is compared with the box, character
// for character. If they differ nothing is sent, and the box is drawn again from the held string.

export type SendGuard = { ok: true } | { ok: false; redraw: string };

export function guardSend(shown: string, held: string): SendGuard {
  return shown === held ? { ok: true } : { ok: false, redraw: held };
}
