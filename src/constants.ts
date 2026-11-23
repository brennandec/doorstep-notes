// Every fixed number, colour, limit and switch lives here, each with its source
// (ruling 22). A test checks that every export has a non-empty source.

export type CloudTier = "no-cost" | "paid";

export const WORKING_TITLE = "Doorstep Notes";
export const TAGLINE = "A writing aid with an egress check.";

// Colours (look and layout, "Paper, ink, one accent").
export const COLOR_PAPER = "#FAF8F3";
export const COLOR_PAPER_2 = "#F1EEE6";
export const COLOR_INK = "#1C1B19";
export const COLOR_INK_2 = "#5E5A52";
export const COLOR_HAIRLINE = "#D9D4C7";
export const COLOR_ACCENT = "#1E6B52";
export const COLOR_FAILURE = "#B3261E";
/** Light accent fill for listed-name chips: the accent at 10 percent over paper. */
export const COLOR_ACCENT_TINT = "#E3EBE5";

// Type and controls (look and layout, "Type" and "Parts").
export const BASE_FONT_PX = 18;
export const NOTE_FONT_PX = 20;
export const MIN_FONT_PX = 16;
export const LINE_HEIGHT = 1.5;
export const CONTROL_HEIGHT_PX = 48;
export const CONTROL_BORDER_PX = 1.5;
export const CONTROL_RADIUS_PX = 10;
export const FOCUS_RING_PX = 3;
export const FOCUS_RING_OFFSET_PX = 2;
export const MIN_TARGET_PX = 44;
export const MAX_FADE_MS = 120;
export const STACK_WIDTH_PX = 1100;
export const ZONE_LEAVES_MIN_PX = 400;
export const ICON_STROKE_PX = 1.75;

// Switches and timings.
/**
 * The cloud switch. On since 2026-11-14: a fresh generateContent probe on project doorstep-notes answered 200
 * and one real cloud draft is recorded with status 200 in results/cloud-draft-2026-11-14.json.
 * No billing step was taken by a build session.
 */
export const AI_SERVICE_ENABLED = true;
/** Shown wherever something is about to be sent, once the service is enabled. */
export const CLOUD_TIER: CloudTier = "paid";
export const PROBE_TIMEOUT_MS = 3000;
export const DEVICE_AVAILABILITY_TIMEOUT_MS = 15000;
/** R19: the "Get the device model" press waits at most this long. It downloads the model (about 4.0 GB in the copy this house measured), so it is far above the availability limit. */
export const DEVICE_INITIALIZE_TIMEOUT_MS = 120000;
/** The size already named in the source line below. Not a new measurement. */
export const DEVICE_MODEL_SIZE_GB = "4.0";
/** H51e: the first device check on page load ends here at the latest; above the 15 s availability plus 15 s probe limits. */
export const FIRST_DEVICE_CHECK_LIMIT_MS = 35000;
export const INVENTED_LIST_SIZE = 12;
export const DEVICE_TOKEN_LIMIT = 9216;
export const SERVE_PORT = 4311;
export const E2E_TIME_LIMIT_S = 120;
export const MIN_FIREBASE_MAJOR = 13;

export const CONSTANT_SOURCES: Record<string, string> = {
  WORKING_TITLE: "steering product.md: working title, not settled",
  TAGLINE: "look and layout, Status bar",
  COLOR_PAPER: "look and layout, Paper, ink, one accent",
  COLOR_PAPER_2: "look and layout, Paper, ink, one accent",
  COLOR_INK: "look and layout, Paper, ink, one accent",
  COLOR_INK_2: "look and layout, Paper, ink, one accent",
  COLOR_HAIRLINE: "look and layout, Paper, ink, one accent",
  COLOR_ACCENT: "look and layout, Paper, ink, one accent",
  COLOR_FAILURE: "look and layout, Paper, ink, one accent",
  COLOR_ACCENT_TINT: "design choice for the light accent fill of listed-name chips (look and layout, Chips); contrast checked by test",
  BASE_FONT_PX: "look and layout, Type",
  NOTE_FONT_PX: "look and layout, Type",
  MIN_FONT_PX: "look and layout, Type",
  LINE_HEIGHT: "look and layout, Type",
  CONTROL_HEIGHT_PX: "look and layout, Parts, Controls",
  CONTROL_BORDER_PX: "look and layout, Parts, Controls",
  CONTROL_RADIUS_PX: "look and layout, Parts, Controls",
  FOCUS_RING_PX: "look and layout, Parts, Controls",
  FOCUS_RING_OFFSET_PX: "look and layout, Parts, Controls",
  MIN_TARGET_PX: "brief and look and layout, Parts, Controls",
  MAX_FADE_MS: "look and layout, Parts, Motion",
  STACK_WIDTH_PX: "fifth review N2 (below 1100 px the zones stack); replaces 1200 px of look and layout",
  ZONE_LEAVES_MIN_PX: "fifth review N2 (zone 2 is never narrower than 400 px while the zones sit side by side)",
  ICON_STROKE_PX: "design choice: one stroke weight for all icons (look and layout, Parts, Icons)",
  AI_SERVICE_ENABLED: "ruling 23 and ruling 15; on after a generateContent probe on project doorstep-notes answered 200 and one real cloud draft was recorded with status 200 (results/cloud-draft-2026-11-14.json)",
  CLOUD_TIER: "docs/decisions/2026-11-14-cloud-tier.md, ruling 1: the owner linked a billing account to project doorstep-notes on 2026-11-14, so the tier is paid",
  PROBE_TIMEOUT_MS: "design choice, shell-and-offline R11.1: a short limit for one probe; no documented figure",
  DEVICE_AVAILABILITY_TIMEOUT_MS: "browser-on-this-computer: availability read under a 15 second limit",
  DEVICE_INITIALIZE_TIMEOUT_MS: "owner order, chain R17 session A item 1: the download press ends at 120 seconds; the model is about 4.0 GB in the copy this house measured",
  DEVICE_MODEL_SIZE_GB: "owner order, chain R17 session A item 1: the download press ends at 120 seconds; the model is about 4.0 GB in the copy this house measured",
  FIRST_DEVICE_CHECK_LIMIT_MS: "design choice, H51e (RULING 08:40Z): a bound on the first check, above the availability and probe limits (15 s each) so it fires only when the check never answers",
  INVENTED_LIST_SIZE: "capture-and-record R10: the invented client list has 12 names",
  DEVICE_TOKEN_LIMIT: "sdk-facts 19: 9216 tokens on device (Firebase hybrid get-started, read 2026-11-12)",
  SERVE_PORT: "browser-on-this-computer, Ports: serve on 4311 only",
  E2E_TIME_LIMIT_S: "tasks.md and design: installability check server limit of 120 seconds",
  MIN_FIREBASE_MAJOR: "sdk-facts difference 1: JS SDK 13.0.0 or later",
  DEFAULT_CLOUD_MODEL: "sdk-facts 27: default cloud model from JS SDK 13.0.0; set explicitly (difference 1)",
  READER_CLOUD_MODEL: "sdk-facts 31: gemini-3.8-flash is named as current on the Firebase pages, read 2026-11-12; the reader's job is inference, drafting stays on DEFAULT_CLOUD_MODEL (owner order H14)",
  NEAR_MATCH_MIN_LETTERS: "ruling 11: edit distance of 1 for names of five letters or more",
  NEAR_MATCH_EDIT_DISTANCE: "ruling 11",
  MIN_NAME_PART_LENGTH: "masking R2.2: name parts of at least 3 letters are matched by default",
  CLOUD_MODEL_HOST: "browser-on-this-computer, Facts the code must use 3: the cloud call goes to this host (observed 2026-11-13 through the Firebase SDK 13.0.0)",
  REMOTE_CONFIG_FETCH_TIMEOUT_MS: "design choice: a short limit so an unreachable service gives the defaults; no documented figure",
  SESSION_CLOUD_CAP: "the per-session cloud-call budget already in force (40); compiled default of session_cloud_cap",
  NOTICE_RETENTION_DAYS: "browser-on-this-computer, The AI service on the project: the provider keeps what is sent and what it answers for 55 days to detect misuse (provider terms and usage policies, read 2026-11-13)",
  DRAFT_SENTENCES_DEVICE: "drafting design, Mode choice: the device prompt asks for five to eight sentences",
  DRAFT_SENTENCES_DEVICE_MAX: "drafting design, Mode choice: the device prompt asks for five to eight sentences",
  SYNTHETIC_SET_SIZE: "measurement R1.1: about 200 rough notes",
  SYNTHETIC_SEED: "measurement R1.2: a fixed seed so the set is the same each run; the value itself is arbitrary",
  DEVICE_MEASURE_LIMIT_MIN: "second review V7 and measurement R12.1: the device run stops at 15 minutes (it was 30 in ruling 7 and measurement R4.2)",
  COLD_START_LIMIT_S: "brief H8: at most 60 seconds on the author's computer with the model already downloaded",
  KEPT_VERSION: "fourth review K1 and shell-and-offline R27.5: the stored data carries a version; data of an unknown version is not read",
  KEPT_KEY: "shell-and-offline R27.2: the one key the kept document is stored under",
};

// Added with the Firebase wrappers.
export const DEFAULT_CLOUD_MODEL = "gemini-3.5-flash-lite";
/** The cloud model of the second reader job only (sdk-facts 31). */
export const READER_CLOUD_MODEL = "gemini-3.8-flash";
export const NEAR_MATCH_MIN_LETTERS = 5;
export const NEAR_MATCH_EDIT_DISTANCE = 1;
export const REMOTE_CONFIG_FETCH_TIMEOUT_MS = 5000;

/** How many cloud model calls one page session may make before it stops. The fetched switch can lower it. */
export const SESSION_CLOUD_CAP = 40;

/** Default shortest name part the exact pass masks (masking R2.2). */
export const MIN_NAME_PART_LENGTH = 3;

/** The host a cloud model call goes to. The request recorder watches it (egress-check task 17). */
export const CLOUD_MODEL_HOST = "firebasevertexai.googleapis.com";

/** Days the provider keeps what is sent and what it answers (shown in the notice before a send). */
export const NOTICE_RETENTION_DAYS = 55;

/** The device prompt asks for this many sentences at the fewest and the most. */
export const DRAFT_SENTENCES_DEVICE = 5;
export const DRAFT_SENTENCES_DEVICE_MAX = 8;

/** Number of invented rough notes in the synthetic set (measurement R1.1). */
export const SYNTHETIC_SET_SIZE = 200;

/** Seed of the set builder. Any fixed value works; this one is arbitrary. */
export const SYNTHETIC_SEED = 20261113;

/** The device measurement stops after this many minutes (second review V7; ruling 7 had 30). */
export const DEVICE_MEASURE_LIMIT_MIN = 15;

/** H8 passes at this many seconds or fewer. */
export const COLD_START_LIMIT_S = 60;

/** The version of the document the page keeps in the browser's store (fourth review K1). Raise it when the shape changes. */
export const KEPT_VERSION = 1;

/** The key of the kept document in the browser's store. */
export const KEPT_KEY = "kept";
