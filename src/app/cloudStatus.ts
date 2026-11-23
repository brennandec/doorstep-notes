// The words of the status bar's cloud state (hosted-cloud R4). The state itself comes from cloudService().
import type { CloudState } from "../firebase/cloudService";
import { fill, strings } from "./strings";

export interface CloudStatusView {
  kind: CloudState["kind"];
  words: string;
}

export function cloudStatusView(state: CloudState): CloudStatusView {
  const s = strings.status;
  switch (state.kind) {
    case "not-configured":
      return { kind: "not-configured", words: s.cloudNotConfigured };
    case "ready":
      // WO-02: configured and usable, but no cloud answer yet. Must not read as "connected".
      return { kind: "ready", words: s.cloudReady };
    case "connected":
      return { kind: "connected", words: s.cloudConnected };
    case "refused":
      return { kind: "refused", words: s.cloudBrowserRefused };
    case "failed":
      return { kind: "failed", words: fill(s.cloudFailed, { detail: state.detail }) };
  }
}
