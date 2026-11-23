// The invented visit: the one example the app ships with (capture-and-record R10).
// Every person here is invented. Smallest version, written by the shell session.
import type { VisitRecord } from "../../inference/types";

export interface InventedVisit {
  note: string;
  clientList: string;
  preparedRecord: VisitRecord;
  mark: "invented example";
}

/** One place clue. It is already in the note and in the record the reader sees. */
export const PLACE_CLUE = "back bedroom";
/** One relation clue. Role words such as worker and landlord stay in the record and rank below this. */
export const RELATION_CLUE = "her sister";

const note = [
  "12/11 home visit 14:00, flat 3, 14 Alder Court. Maria O-R in, sister Bea there too.",
  "Mould in back bedroom again, worse by the window. Landlord not replied to 2 emails.",
  "Maria missed the benefits form deadline last wk, letter on the table. DOB on form 3/3/87.",
  "Agreed: I ring landlord Mon. Maria posts form Fri. Tomas Brandvald (neighbour, also on",
  "my list) offered to help with the form.",
  "Risk: rent arrears if form is late.",
  "Next: revisit 26/11.",
].join("\n");

const clientList = [
  "Maria Okonkwo-Reyes; Maria O-R, Mari; she/her",
  "Tomas Brandvold; Tom; he/him",
  "Priya Halloran; ; she/her",
  "Joel Ashworth-Nkemelu; Joe; he/him",
  "Sunniva Teodorescu; ; she/her",
  "Kwabena Lindqvist; Kobby; he/him",
  "Rosalind Achterberg; Ros; they/them",
  "Emeka Fairbairn; ; he/him",
  "Halina Quarshie; ; she/her",
  "Dmitri Oyelaran; Dima; he/him",
  "Wren Castellano-Hughes; ; they/them",
  "Agnieszka Mbatha; Aga; she/her",
].join("\n");

export const inventedVisit: InventedVisit = {
  note,
  clientList,
  mark: "invented example",
  preparedRecord: {
    visitDate: "12/11",
    purpose: ["Home visit."],
    present: [
      { label: "Maria Okonkwo-Reyes", role: "client" },
      { label: "Bea", role: "other" },
      { label: "Dana Whitfield", role: "worker" },
    ],
    seen: ["Mould in the back bedroom, worse by the window.", "Her sister was there.", "Letter about the benefits form on the table."],
    agreed: [
      "Worker rings the landlord on Mon.",
      "Maria posts the form on Fri.",
      "Tomas Brandvald offered to help with the form.",
    ],
    risks: ["Rent arrears if the form is late."],
    nextSteps: ["Revisit on 26/11."],
  },
};
