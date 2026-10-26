import { jest } from "@jest/globals";
import { execFile } from "child_process";
import * as fs from "fs";
import * as http from "http";
import type { AddressInfo } from "net";
import * as os from "os";
import * as path from "path";

// Smoke-tests the committed bundles against a fake GitHub API. Unit tests mock
// @actions/*, so only this catches a dependency or bundler bump that breaks dist/.

jest.setTimeout(30_000);

interface Call {
  method: string;
  url: string;
  auth?: string;
  body?: { body?: string; content?: string };
}

let calls: Call[] = [];
let existing: { id: number; body: string }[] = [];
let server: http.Server;
let apiUrl: string;
let tmp: string;

function respond(req: http.IncomingMessage, res: http.ServerResponse, raw: string): void {
  const call: Call = { method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined };
  calls = [...calls, call];
  const send = (status: number, data?: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  const id = Number(call.url.match(/\/comments\/(\d+)/)?.[1]);
  if (call.method === "GET") return send(200, existing.map((c) => ({ ...c, html_url: `https://gh/c/${c.id}` })));
  if (call.method === "POST" && call.url.endsWith("/reactions")) return send(201, { id: 1, content: call.body?.content });
  if (call.method === "POST") return send(201, { id: 100, body: call.body?.body, html_url: "https://gh/c/100" });
  if (call.method === "PATCH") return send(200, { id, body: call.body?.body, html_url: `https://gh/c/${id}` });
  if (call.method === "DELETE") return send(204);
  send(404, { message: "Not Found" });
}

function runDist(entry: string, inputs: Record<string, string>, extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    GITHUB_API_URL: apiUrl,
    GITHUB_REPOSITORY: "o/r",
    GITHUB_EVENT_PATH: path.join(tmp, "event.json"),
    GITHUB_OUTPUT: path.join(tmp, "output"),
    GITHUB_STATE: path.join(tmp, "state"),
    ...extraEnv,
  };
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v;
  return new Promise<{ code: number; stdout: string }>((resolve) => {
    execFile(process.execPath, [path.resolve(entry)], { env, timeout: 20_000 }, (err, stdout) => {
      resolve({ code: !err ? 0 : typeof err.code === "number" ? err.code : 1, stdout });
    });
  });
}

// Parses the `name<<delimiter\nvalue\ndelimiter` format of GITHUB_OUTPUT / GITHUB_STATE.
function readFileCommands(name: string): Record<string, string> {
  const text = fs.readFileSync(path.join(tmp, name), "utf8");
  return Object.fromEntries([...text.matchAll(/^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2$/gm)].map((m) => [m[1], m[3]]));
}

const marker = "<!-- actions-pr-comment:t -->";
const baseInputs = { "github-token": "tok", mode: "upsert", "create-if-not-exists": "true" };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => respond(req, res, raw));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prc-dist-"));
  fs.writeFileSync(path.join(tmp, "event.json"), JSON.stringify({ pull_request: { number: 5 } }));
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  calls = [];
  existing = [];
  fs.writeFileSync(path.join(tmp, "output"), "");
  fs.writeFileSync(path.join(tmp, "state"), "");
});

describe("dist bundles", () => {
  it("creates a tagged comment with reactions and sets outputs", async () => {
    const { code } = await runDist("dist/index.js", { ...baseInputs, message: "hello", "comment-tag": "t", reactions: "rocket,eyes" });

    expect(code).toBe(0);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /repos/o/r/issues/5/comments?per_page=100",
      "POST /repos/o/r/issues/5/comments",
      "POST /repos/o/r/issues/comments/100/reactions",
      "POST /repos/o/r/issues/comments/100/reactions",
    ]);
    expect(calls[0].auth).toMatch(/^(token|bearer) tok$/i);
    expect(calls[1].body).toEqual({ body: `hello\n\n${marker}` });
    expect(calls.slice(2).map((c) => c.body?.content)).toEqual(["rocket", "eyes"]);
    expect(readFileCommands("output")).toEqual({ id: "100", body: `hello\n\n${marker}`, "html-url": "https://gh/c/100" });
    expect(readFileCommands("state")).toEqual({});
  });

  it("updates the existing tagged comment", async () => {
    existing = [{ id: 7, body: "unrelated" }, { id: 9, body: `old\n\n${marker}` }];
    const { code } = await runDist("dist/index.js", { ...baseInputs, message: "new", "comment-tag": "t" });

    expect(code).toBe(0);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /repos/o/r/issues/5/comments?per_page=100",
      "PATCH /repos/o/r/issues/comments/9",
    ]);
    expect(readFileCommands("output").id).toBe("9");
  });

  it("deletes the comment in the post step for delete-on-completion", async () => {
    const inputs = { ...baseInputs, mode: "delete-on-completion", message: "running", "comment-tag": "t" };
    const main = await runDist("dist/index.js", inputs);
    expect(main.code).toBe(0);
    const state = readFileCommands("state");
    expect(state).toEqual({ "comment-id": "100" });

    calls = [];
    const post = await runDist("dist/cleanup/index.js", inputs, { "STATE_comment-id": state["comment-id"] });
    expect(post.code).toBe(0);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /repos/o/r/issues/comments/100"]);
  });

  it("fails the step on invalid input without calling the API", async () => {
    const { code, stdout } = await runDist("dist/index.js", { ...baseInputs, mode: "bogus", message: "hi" });

    expect(code).toBe(1);
    expect(stdout).toContain('::error::Invalid mode "bogus"');
    expect(calls).toEqual([]);
  });
});
