/**
 * Exercise the static handler using real public files and a minimal HTTP response
 * recorder. No listening socket, browser, or external service is required.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleRequest, parsePort } from "../server.js";

async function request(url, method = "GET") {
  const result = { headers: {} };
  const response = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    writeHead(status, headers) {
      result.status = status;
      Object.assign(result.headers, headers);
    },
    end(body) {
      result.body = body;
    },
  };
  await handleRequest({ url, method }, response);
  return result;
}

test("server returns each public file with its correct type and response headers", async () => {
  for (const [path, file, type] of [
    ["/", "index.html", "text/html"],
    ["/index.html", "index.html", "text/html"],
    ["/styles.css?v=2", "styles.css", "text/css"],
    ["/app.js", "app.js", "text/javascript"],
    ["/core.js", "core.js", "text/javascript"],
    ["/favicon.svg", "favicon.svg", "image/svg+xml"],
  ]) {
    const response = await request(path);
    const expected = await readFile(new URL(`../${file}`, import.meta.url));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, expected);
    assert.ok(response.headers["Content-Type"].startsWith(type));
    assert.equal(response.headers["Content-Length"], expected.length);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
  }
});

test("HEAD returns GET headers without sending an asset or error body", async () => {
  for (const path of ["/app.js", "/missing"]) {
    const get = await request(path);
    const head = await request(path, "HEAD");
    assert.equal(head.status, get.status);
    assert.deepEqual(head.headers, get.headers);
    assert.equal(head.body, undefined);
  }
});

test("private files, directory listings, traversal, and API routes are not served", async () => {
  for (const path of [
    "/README.md",
    "/AGENTS.md",
    "/package.json",
    "/server.js",
    "/tests/server.test.js",
    "/.git/config",
    "/.aws/credentials",
    "/.env",
    "/tests/",
    "/../index.html",
    "/%2e%2e/index.html",
    "/%2fapp.js",
    "/app.js/extra",
    "/v1/models",
    "//example.com/app.js",
    "",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body, "Not found.\n");
  }
});

test("unsupported HTTP methods are rejected with allowed methods", async () => {
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await request("/", method);
    assert.equal(response.status, 405);
    assert.equal(response.headers.Allow, "GET, HEAD");
  }
});

test("CLI port defaults and custom values are validated", () => {
  assert.equal(parsePort(), 8080);
  assert.equal(parsePort("8081"), 8081);
  assert.equal(parsePort("65535"), 65535);
  for (const value of ["", "0", "65536", "1.5", "8080abc", "-1", "NaN"]) {
    assert.throws(() => parsePort(value), /Port must/);
  }
});
