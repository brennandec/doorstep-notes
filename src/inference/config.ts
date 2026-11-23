// Model names with defaults in code. The cloud model name is
// always set explicitly (sdk-facts difference 1), never left to the SDK default.
import { DEFAULT_CLOUD_MODEL } from "../constants";

export function cloudModelName(settings?: { cloudModel?: unknown } | null): string {
  const value = settings?.cloudModel;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : DEFAULT_CLOUD_MODEL;
}
