// The press returned at 120 s. The download promise is still running.
export class DownloadContinuing extends Error {
  readonly done: Promise<void>;
  constructor(done: Promise<void>) {
    super("The download is still running.");
    this.name = "DownloadContinuing";
    this.done = done;
  }
}
