// Smallest version of the egress ticket the job interfaces need (drafting design).
// Only src/egress/send.ts (egress-check spec) is meant to create one.
declare const ticket: unique symbol;
export type EgressTicket = { readonly [ticket]: true };
