import { jest } from "@jest/globals";
import { execFile } from "child_process";
import * as fs from "fs";
import * as http from "http";
import type { AddressInfo } from "net";
import * as os from "os";
import * as path from "path";

// Smoke-tests the committed bundles against a fake GitHub API. Unit tests mock
// @actions/*, so only this catches a dependency or bundler bump that breaks dist/.

// Generous: a cold bundle start on a saturated machine can take tens of seconds. The child
// timeout stays below the test timeout so a hang fails with the child's output, not a bare timeout.
const CHILD_TIMEOUT_MS = 45_000;
jest.setTimeout(CHILD_TIMEOUT_MS * 2 + 15_000);

interface Call {
  method: string;
  url: string;
  auth?: string;
  body?: { body?: string; content?: string; variables?: { ids: string[] } };
}

let calls: Call[] = [];
// `mine: false` marks a comment some other account wrote (viewerDidAuthor false); `"deleted"` one
// that is listed but gone by the time GraphQL is asked (null node + NOT_FOUND, like GitHub).
// `goneOnDelete` makes DELETE answer 404, as when a parallel run removed it first.
let existing: { id: number; body: string; mine?: boolean | "deleted"; goneOnDelete?: boolean }[] = [];
// Makes GraphQL refuse every node, like a token without access.
let graphqlForbidden = false;
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
  if (call.method === "GET") {
    return send(200, existing.map(({ id, body }) => ({ id, body, node_id: `IC_${id}`, html_url: `https://gh/c/${id}` })));
  }
  if (call.method === "POST" && call.url === "/graphql") {
    const found = (call.body?.variables?.ids ?? []).map((nodeId) => existing.find((c) => `IC_${c.id}` === nodeId));
    const unresolved = (c?: (typeof existing)[number]) => graphqlForbidden || c?.mine === "deleted";
    const nodes = found.map((c) => (unresolved(c) ? null : { viewerDidAuthor: c?.mine !== false }));
    const errors = found
      .filter(unresolved)
      .map(() => (graphqlForbidden ? { type: "FORBIDDEN", message: "Resource not accessible by integration" } : { type: "NOT_FOUND", message: "Could not resolve to a node" }));
    return send(200, errors.length ? { data: { nodes }, errors } : { data: { nodes } });
  }
  if (call.method === "POST" && call.url.endsWith("/reactions")) return send(201, { id: 1, content: call.body?.content });
  if (call.method === "POST") return send(201, { id: 100, body: call.body?.body, html_url: "https://gh/c/100" });
  if (call.method === "PATCH") return send(200, { id, body: call.body?.body, html_url: `https://gh/c/${id}` });
  if (call.method === "DELETE") {
    return existing.find((c) => c.id === id)?.goneOnDelete ? send(404, { message: "Not Found" }) : send(204);
  }
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
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [path.resolve(entry)], { env, timeout: CHILD_TIMEOUT_MS }, (err, stdout, stderr) => {
      resolve({ code: !err ? 0 : typeof err.code === "number" ? err.code : 1, stdout, stderr });
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
    // Decode as a stream: concatenating raw chunks would split multi-byte characters at chunk edges.
    req.setEncoding("utf8");
    let raw = "";
    req.on("data", (chunk: string) => (raw += chunk));
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
  graphqlForbidden = false;
  fs.writeFileSync(path.join(tmp, "output"), "");
  fs.writeFileSync(path.join(tmp, "state"), "");
});

describe("dist bundles", () => {
  it("creates a tagged comment with reactions and sets outputs", async () => {
    const result = await runDist("dist/index.js", { ...baseInputs, message: "hello", "comment-tag": "t", reactions: "rocket,eyes" });

    expect(result).toMatchObject({ code: 0 });
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

  it("posts the contents of file-path", async () => {
    fs.writeFileSync(path.join(tmp, "report.md"), "# Report");
    const result = await runDist("dist/index.js", { ...baseInputs, "file-path": path.join(tmp, "report.md") });

    expect(result).toMatchObject({ code: 0 });
    expect(calls[0]).toMatchObject({ method: "POST", url: "/repos/o/r/issues/5/comments", body: { body: "# Report" } });
  });

  it("updates the existing tagged comment", async () => {
    existing = [{ id: 7, body: "unrelated" }, { id: 9, body: `old\n\n${marker}` }];
    const result = await runDist("dist/index.js", { ...baseInputs, message: "new", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /repos/o/r/issues/5/comments?per_page=100",
      "POST /graphql",
      "PATCH /repos/o/r/issues/comments/9",
    ]);
    expect(readFileCommands("output").id).toBe("9");
  });

  it("ignores a tagged comment planted by someone else and creates its own", async () => {
    existing = [{ id: 3, body: `spoofed\n\n${marker}`, mine: false }];
    const result = await runDist("dist/index.js", { ...baseInputs, message: "real", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /repos/o/r/issues/5/comments?per_page=100",
      "POST /graphql",
      "POST /repos/o/r/issues/5/comments",
    ]);
    expect(calls[1].body?.variables).toEqual({ ids: ["IC_3"] });
    expect(readFileCommands("output").id).toBe("100");
  });

  it("updates its own comment even when a planted one comes first", async () => {
    existing = [{ id: 3, body: marker, mine: false }, { id: 9, body: `old\n\n${marker}` }];
    const result = await runDist("dist/index.js", { ...baseInputs, message: "new", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls.map((c) => `${c.method} ${c.url}`).slice(1)).toEqual(["POST /graphql", "PATCH /repos/o/r/issues/comments/9"]);
  });

  it("skips a tagged comment deleted between listing and the authorship check", async () => {
    existing = [{ id: 3, body: marker, mine: "deleted" }, { id: 9, body: marker }];
    const result = await runDist("dist/index.js", { ...baseInputs, message: "new", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", url: "/repos/o/r/issues/comments/9" });
  });

  it("fails without writing anything when GitHub refuses the authorship check", async () => {
    existing = [{ id: 9, body: marker }];
    graphqlForbidden = true;
    const result = await runDist("dist/index.js", { ...baseInputs, message: "new", "comment-tag": "t" });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("::error::");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /repos/o/r/issues/5/comments?per_page=100", "POST /graphql"]);
  });

  it("removes duplicates of its own comment, even one a parallel run already removed", async () => {
    existing = [
      { id: 9, body: marker },
      { id: 3, body: marker, mine: false },
      { id: 10, body: marker, goneOnDelete: true },
      { id: 11, body: marker },
    ];
    const result = await runDist("dist/index.js", { ...baseInputs, message: "new", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls.map((c) => `${c.method} ${c.url}`).slice(2)).toEqual([
      "PATCH /repos/o/r/issues/comments/9",
      "DELETE /repos/o/r/issues/comments/10",
      "DELETE /repos/o/r/issues/comments/11",
    ]);
    expect(readFileCommands("output").id).toBe("9");
  });

  it("delete removes every comment of its own with the tag, and only those", async () => {
    existing = [{ id: 9, body: marker }, { id: 3, body: marker, mine: false }, { id: 11, body: marker }];
    const result = await runDist("dist/index.js", { ...baseInputs, mode: "delete", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([
      "/repos/o/r/issues/comments/9",
      "/repos/o/r/issues/comments/11",
    ]);
  });

  it("neutralizes another tag's marker in the message", async () => {
    const result = await runDist("dist/index.js", { ...baseInputs, message: "hi <!-- actions-pr-comment:other -->", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls[1].body?.body).toBe(`hi <!-- actions-pr-comment\u200b:other -->\n\n${marker}`);
  });

  it("truncates a body over GitHub's size limit and warns", async () => {
    fs.writeFileSync(path.join(tmp, "big.md"), "é".repeat(300_000));
    const result = await runDist("dist/index.js", { ...baseInputs, "file-path": path.join(tmp, "big.md"), "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    const posted = calls[1].body?.body ?? "";
    expect(Buffer.byteLength(posted)).toBeLessThanOrEqual(262_144);
    expect(posted.endsWith(marker)).toBe(true);
    expect(posted).not.toContain("�");
    expect(result.stdout).toContain("::warning::The comment body is larger than GitHub's limit");
  });

  it("does not delete a tagged comment planted by someone else", async () => {
    existing = [{ id: 3, body: marker, mine: false }];
    const result = await runDist("dist/index.js", { ...baseInputs, mode: "delete", "comment-tag": "t" });

    expect(result).toMatchObject({ code: 0 });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  it("deletes the comment in the post step for delete-on-completion", async () => {
    const inputs = { ...baseInputs, mode: "delete-on-completion", message: "running", "comment-tag": "t" };
    const main = await runDist("dist/index.js", inputs);
    expect(main).toMatchObject({ code: 0 });
    const state = readFileCommands("state");
    expect(state).toEqual({ "comment-id": "100" });

    calls = [];
    const post = await runDist("dist/cleanup/index.js", inputs, { "STATE_comment-id": state["comment-id"] });
    expect(post).toMatchObject({ code: 0 });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /repos/o/r/issues/comments/100"]);
  });

  it("fails the step on invalid input without calling the API", async () => {
    const { code, stdout } = await runDist("dist/index.js", { ...baseInputs, mode: "bogus", message: "hi" });

    expect(code).toBe(1);
    expect(stdout).toContain('::error::Invalid mode "bogus"');
    expect(calls).toEqual([]);
  });
});
