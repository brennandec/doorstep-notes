// Test doubles for the three cloud jobs. They make no network request and every
// result says connected: false, which the screen shows as "not connected".
// There is no double for a device job in the built app (ruling 23).
export { draftDouble } from "./draft/draft.double";

export { rewriteDouble } from "./rewrite/rewrite.double";

export { secondReaderDouble } from "./secondReader/secondReader.double";
