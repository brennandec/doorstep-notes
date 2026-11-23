# Fetched settings return for real jobs

2026-11-21

The file `docs/decisions/2026-11-14-cut-three-firebase-parts.md` stays as it was written. This decision reverses only the first of the three cuts.

The desk ruling of 2026-11-21T07:19:04Z brings back `src/firebase/remoteConfig.ts`. The jobs are `draft_model`, `reader_model`, `cloud_enabled`, `session_cloud_cap`, `appcheck_limited_use` (off unless the fetched value is true) and `mask_policy`. Compiled defaults equal the constants in `src/constants.ts`. A fetch that times out or aborts within `REMOTE_CONFIG_FETCH_TIMEOUT_MS` uses those defaults.

Anonymous sign-in stays cut. The cloud ledger store stays cut. The ledger on this device stays.

`remoteconfig.template.json` is the template that deploys with hosting. This plate did not deploy it.
