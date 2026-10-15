/**
 * Dependency-free static server for Contract Pal. It serves the browser assets
 * only; contract analysis still goes directly from the browser to Ollama.
 * Paths resolve relative to this module, so launching from another directory
 * does not accidentally serve that directory's contents.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// An explicit allowlist prevents directory listings and access to configuration,
// repository metadata, documentation, tests, or arbitrary filesystem paths.
const PUBLIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/core.js", ["core.js", "text/javascript; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);

/**
 * Handle GET and HEAD requests without accepting uploads or proxying API calls.
 * Exporting the handler lets tests verify real asset reads and HTTP responses
 * without opening a listening socket or requiring an Ollama installation.
 */
export async function handleRequest(request, response) {
  const send = (status, contentType, body) => {
    response.writeHead(status, {
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    // HEAD returns the same headers as GET, including length, but no body.
    response.end(request.method === "HEAD" ? undefined : body);
  };
  const sendText = (status, message) =>
    send(status, "text/plain; charset=utf-8", message);

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(405, "Method not allowed.\n");
    return;
  }

  // Match literal paths, ignoring cache-busting query strings. Do not decode or
  // normalize user input into file paths: encoded traversal never matches a key.
  const pathname = (request.url || "").split("?")[0];
  const asset = PUBLIC_FILES.get(pathname);
  if (!asset) {
    sendText(404, "Not found.\n");
    return;
  }

  try {
    const [file, contentType] = asset;
    const body = await readFile(new URL(file, import.meta.url));
    send(200, contentType, body);
  } catch (error) {
    // Keep filesystem details out of the HTTP response; show them locally instead.
    console.error("Could not read an app asset:", error.message);
    sendText(500, "Could not load an app file. Check the server terminal.\n");
  }
}

/** Validate an optional CLI port before attempting to bind a socket. */
export function parsePort(value = "8080") {
  if (
    !/^\d+$/.test(String(value)) ||
    Number(value) < 1 ||
    Number(value) > 65535
  ) {
    throw new Error("Port must be a whole number from 1 to 65535.");
  }
  return Number(value);
}

// Importing this module for tests must not start a server. A direct invocation
// accepts one optional port: `node server.js 8081` or `npm start -- 8081`.
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    if (process.argv.length > 3) {
      throw new Error("Usage: node server.js [port]");
    }
    const port = parsePort(process.argv[2]);
    const server = createServer(handleRequest);
    server.on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? `Port ${port} is already in use. Try npm start -- ${port === 65535 ? 8080 : port + 1}.`
          : `Could not start the server: ${error.message}`,
      );
      process.exitCode = 1;
    });
    // Loopback-only by default: the bundled server is for this computer's browser.
    server.listen(port, "127.0.0.1", () => {
      console.log(`Contract Pal is ready at http://127.0.0.1:${port}`);
      console.log("Press Ctrl+C to stop.");
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
