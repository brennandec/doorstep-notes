// Serves dist/ for one check, on one port, and stops. If the port is busy it
// fails; it never falls back to another port, because another project on this
// computer may be serving a page there (browser-on-this-computer, Ports).
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { E2E_TIME_LIMIT_S, SERVE_PORT } from "../../../src/constants";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

export interface RunningServer {
  url: string;
  port: number;
  stop(): Promise<void>;
}

export async function startStaticServer(options: { dir?: string; port?: number; limitMs?: number; files?: Record<string, string | Buffer> } = {}): Promise<RunningServer> {
  const dir = resolve(options.dir ?? "dist");
  const port = options.port ?? SERVE_PORT;
  const limitMs = options.limitMs ?? E2E_TIME_LIMIT_S * 1000;

  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const served = options.files?.[path];
    if (served !== undefined) {
      res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(served);
      return;
    }
    const page = path === "/" || path === "/about" || path === "/about/" ? "index.html" : path;
    const file = normalize(join(dir, page));
    if (file !== dir && !file.startsWith(dir + sep)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(readFileSync(file));
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "EADDRINUSE" ? new Error(`Port ${port} is busy. Stop and report; do not use another port.`) : err);
    });
    server.listen(port, "127.0.0.1", () => resolveListen());
  });

  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  let stopped = false;
  const stop = () =>
    new Promise<void>((resolveStop) => {
      if (stopped) return resolveStop();
      stopped = true;
      clearTimeout(timer);
      server.closeAllConnections();
      server.close(() => resolveStop());
    });
  // Time limit: the server stops itself even if a test forgets to.
  const timer = setTimeout(() => void stop(), limitMs);
  timer.unref();
  return { url: `http://127.0.0.1:${actual}`, port: actual, stop };
}
