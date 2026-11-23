# Testing

The hardware floor is Chrome's Prompt API list, as recorded in `docs/sdk-facts.md` item 5, read 2026-11-12.

- Windows 10 or 11, macOS 13 or later, Linux, or ChromeOS on Chromebook Plus.
- At least 22 GB free on the Chrome profile volume.
- A GPU with strictly more than 4 GB of VRAM, or a CPU with 16 GB of RAM and 4 cores.
- An unmetered network for the first download.
- If free space drops below 10 GB after the download, Chrome removes the model and downloads it again once the requirements are met.

The size beside "Get the device model" is the figure already named for this copy: about 4.0 GB (`src/constants.ts`, the source line for `DEVICE_INITIALIZE_TIMEOUT_MS`). It is not a new measurement.

`results/device-floor-*.json` is what a fresh Chrome profile reported. The check calls `availability()` only. It does not call `create()` and it does not start a download.
