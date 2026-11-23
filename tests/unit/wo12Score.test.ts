import { describe, expect, it } from "vitest";
import { cloudStatusView } from "../../src/app/cloudStatus";
import { cloudWordsBeforeDraft, fivePartsPresent, namesPutBack, summarizeWo12, tagLeak, unclearAfterSecondPerson } from "../../scripts/wo12Score";

const full = {
  purpose: "Home visit for the rent form.",
  observed: "Damp was on the bedroom wall.",
  agreed: "The worker rings the landlord on Monday.",
  risks: "The rent falls behind if the form is late.",
  next: "The worker visits again next month.",
};

describe("WO-12 score", () => {
  it("counts five non-empty parts", () => {
    expect(fivePartsPresent(full)).toBe(true);
    expect(fivePartsPresent({ ...full, purpose: "  " })).toBe(false);
  });

  it("reads a mask token as a tag leak", () => {
    expect(tagLeak("Maria rang the landlord.")).toBeNull();
    expect(tagLeak("Then [Person 1] rang.")).toBe("[Person 1]");
  });

  it("flags a pronoun only after two listed names in the same sentence", () => {
    const names = ["Maria Okonkwo-Reyes", "Tomas Brandvold"];
    expect(unclearAfterSecondPerson("Maria Okonkwo-Reyes was present. She asked for the form.", names)).toBeNull();
    expect(
      unclearAfterSecondPerson("Maria Okonkwo-Reyes asked Tomas Brandvold whether she would sign.", names),
    ).toBe("she");
  });

  it("puts a tagged person back only when the shown note has the name and no tag", () => {
    const names = ["Maria Okonkwo-Reyes"];
    expect(namesPutBack({ shown: "Maria Okonkwo-Reyes was present.", raw: "[Person 1] was present.", names })).toBe(true);
    expect(namesPutBack({ shown: "[Person 1] was present.", raw: "[Person 1] was present.", names })).toBe(false);
    expect(namesPutBack({ shown: "The worker rang the landlord.", raw: "The worker rang the landlord.", names })).toBe(true);
  });

  it("passes the plan bar: device at least 10 of 12, cloud 12 of 12, none invented", () => {
    const clean = { fiveParts: true, invented: false, tagLeak: false, unclear: false, namesBack: true };
    expect(summarizeWo12(Array.from({ length: 12 }, () => clean), "cloud").pass).toBe(true);
    expect(summarizeWo12(Array.from({ length: 12 }, () => clean), "device").pass).toBe(true);
    const ten = Array.from({ length: 12 }, (_, i) => ({ ...clean, fiveParts: i < 10 }));
    expect(summarizeWo12(ten, "device").pass).toBe(true);
    const nine = Array.from({ length: 12 }, (_, i) => ({ ...clean, fiveParts: i < 9 }));
    expect(summarizeWo12(nine, "device").pass).toBe(false);
    expect(summarizeWo12([{ ...clean, invented: true }, ...Array.from({ length: 11 }, () => clean)], "device").pass).toBe(false);
    const cloudEleven = Array.from({ length: 12 }, (_, i) => ({ ...clean, fiveParts: i < 11 }));
    expect(summarizeWo12(cloudEleven, "cloud").pass).toBe(false);
  });

  it("expects the ready words before a draft call, and makes no call", () => {
    expect(cloudWordsBeforeDraft()).toBe(cloudStatusView({ kind: "ready" }).words);
    expect(cloudWordsBeforeDraft()).toBe("ready, not used yet");
    expect(cloudWordsBeforeDraft()).not.toBe("connected");
  });
});
