// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "update-from-upstream.sh");
let dir: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const write = (repo: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
};
const commitAll = (repo: string, msg: string) => {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", msg);
};
const initRepo = (name: string) => {
  const repo = path.join(dir, name);
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "t");
  git(repo, "config", "user.email", "t@t");
  return repo;
};
const sync = (repo: string, upstream: string) => {
  git(repo, "fetch", "-q", upstream, "main:refs/up/main");
  const r = spawnSync("bash", [SCRIPT, "refs/up/main", path.join(dir, "body.md")], {
    cwd: repo,
    encoding: "utf8",
  });
  return {
    code: r.status,
    err: r.stderr,
    body: existsSync(path.join(dir, "body.md"))
      ? readFileSync(path.join(dir, "body.md"), "utf8")
      : "",
  };
};
const read = (repo: string, file: string) => readFileSync(path.join(repo, file), "utf8");

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ufu-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("update-from-upstream.sh", () => {
  it("overwrites by file when histories are unrelated, protecting env, vercel, ignored and workflows", () => {
    const up = initRepo("up");
    write(up, "src/app.ts", "v1");
    commitAll(up, "first");
    write(up, "src/app.ts", "v2");
    write(up, "src/new.ts", "new");
    write(up, ".env.example", "UP=1");
    write(up, "vercel.json", "upstream-vercel");
    write(up, "secret.local", "upstream-secret");
    write(up, ".github/workflows/test.yml", "upstream-wf");
    commitAll(up, "second");

    const me = initRepo("me"); // unrelated history, like a Vercel clone
    write(me, "src/app.ts", "v1");
    write(me, ".gitignore", "secret.local\n");
    write(me, "vercel.json", "mine-vercel");
    write(me, ".github/workflows/test.yml", "mine-wf");
    write(me, "my-own.md", "keep me");
    commitAll(me, "Initial commit");

    const r = sync(me, up);

    expect(r.code).toBe(0);
    expect(read(me, "src/app.ts")).toBe("v2");
    expect(read(me, "src/new.ts")).toBe("new");
    expect(read(me, "vercel.json")).toBe("mine-vercel");
    expect(read(me, ".github/workflows/test.yml")).toBe("mine-wf");
    expect(existsSync(path.join(me, ".env.example"))).toBe(false);
    expect(existsSync(path.join(me, "secret.local"))).toBe(false);
    expect(read(me, "my-own.md")).toBe("keep me");
    expect(r.body).toContain("second");
    expect(r.body).toContain("my-own.md");
    expect(git(me, "status", "--porcelain")).toBe("");
  });

  it("exits 10 when the overwrite changes nothing", () => {
    const up = initRepo("up");
    write(up, "a.txt", "same");
    commitAll(up, "only");
    const me = initRepo("me");
    write(me, "a.txt", "same");
    commitAll(me, "Initial commit");

    expect(sync(me, up).code).toBe(10);
  });

  it("merges when history is shared, lists new commits, keeps protected paths", () => {
    const up = initRepo("up");
    write(up, "a.txt", "1");
    write(up, ".github/workflows/test.yml", "wf1");
    commitAll(up, "base");
    const me = dir + "/me";
    git(dir, "clone", "-q", up, me);
    git(me, "config", "user.name", "t");
    git(me, "config", "user.email", "t@t");
    write(me, "mine.txt", "mine");
    commitAll(me, "local change");
    write(up, "a.txt", "2");
    write(up, ".github/workflows/test.yml", "wf2");
    write(up, ".github/workflows/added.yml", "wf-new");
    commitAll(up, "upstream change");

    const r = sync(me, up);

    expect(r.code).toBe(0);
    expect(read(me, "a.txt")).toBe("2");
    expect(read(me, "mine.txt")).toBe("mine");
    expect(read(me, ".github/workflows/test.yml")).toBe("wf1");
    expect(existsSync(path.join(me, ".github/workflows/added.yml"))).toBe(false);
    expect(r.body).toContain("upstream change");
    expect(r.body).not.toContain("base");
  });

  it("exits 10 when upstream is already merged", () => {
    const up = initRepo("up");
    write(up, "a.txt", "1");
    commitAll(up, "base");
    const me = dir + "/me";
    git(dir, "clone", "-q", up, me);

    expect(sync(me, up).code).toBe(10);
  });
});
