// Small words shared by the second-reader panel and the README status lines (second-reader R7,
// measurement R16). No browser API here, so the README writer can use it in Node.
import { fill, strings } from "./strings";

export const withCommas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "one request" or "N requests". */
export const requestWords = (n: number): string =>
  n === 1 ? strings.secondReader.requestOne : fill(strings.secondReader.requestMany, { n: String(n) });
