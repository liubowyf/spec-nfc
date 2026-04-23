import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI_PATH = path.join(PROJECT_ROOT, "bin/specnfc.mjs");

test("四工具入口在完成态下共享同源规则与项目索引", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-projection-v3-synced-"));

  try {
    const initResult = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(initResult.status, 0);

    const agents = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    const claude = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");
    const trae = await readFile(path.join(cwd, ".trae/rules/project_rules.md"), "utf8");
    const opencode = JSON.parse(await readFile(path.join(cwd, "opencode.json"), "utf8"));

    for (const content of [agents, claude, trae]) {
      assert.match(content, /clarify → design → plan → execute → verify → accept → archive/);
      assert.match(content, /specs\/project\/summary\.md/);
    }

    assert.ok(opencode.instructions.includes("AGENTS.md"));
    assert.ok(opencode.instructions.includes(".specnfc/indexes/project-index.json"));
    assert.ok(opencode.instructions.includes("specs/project/**/*.md"));
    assert.ok(opencode.instructions.includes("specs/changes/**/*.md"));

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    assert.equal(doctorJson.data.controlPlane.projectionStatus, "synced");
    assert.equal(doctorJson.data.controlPlane.skillPackStatus, "synced");
    assert.equal(doctorJson.data.controlPlane.projectionHealth.status, "synced");
    assert.equal(doctorJson.data.controlPlane.projectionHealth.driftCount, 0);
    assert.ok(doctorJson.data.controlPlane.projectionHealth.items.every((item) => item.status === "synced"));

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.equal(statusJson.data.repo.controlPlane.projectionStatus, "synced");
    assert.equal(statusJson.data.repo.controlPlane.skillPackStatus, "synced");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会把入口缺少 canonical phase / project summary 识别为 projection drift", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-projection-v3-entry-drift-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    await writeFile(
      path.join(cwd, "AGENTS.md"),
      [
        "# AGENTS",
        "",
        "## 个人 Skills 兼容规则",
        "- 与个人 skills 或本地习惯冲突时，以仓内正式规范、`.specnfc/` 和当前 change 为准。"
      ].join("\n"),
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.controlPlane.projectionStatus, "drifted");
    const agentsItem = json.data.controlPlane.projectionHealth.items.find((item) => item.file === "AGENTS.md");
    assert.equal(agentsItem.status, "drifted");
    assert.ok(agentsItem.missingMarkers.some((item) => item.includes("clarify → design → plan → execute → verify → accept → archive")));
    assert.ok(agentsItem.missingMarkers.some((item) => item.includes("specs/project/summary.md")));
    assert.ok(json.data.compliance.advisoryIssues.includes("PROJECTION_DRIFT"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会把 opencode 缺少 project-level 指令识别为 projection drift", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-projection-v3-opencode-drift-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    await writeFile(
      path.join(cwd, "opencode.json"),
      `${JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          instructions: [
            "AGENTS.md",
            ".specnfc/README.md",
            ".specnfc/runtime/active-rules.json",
            ".specnfc/governance/**/*.md"
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.controlPlane.projectionStatus, "drifted");
    const opencodeItem = json.data.controlPlane.projectionHealth.items.find((item) => item.file === "opencode.json");
    assert.equal(opencodeItem.status, "drifted");
    assert.ok(opencodeItem.missingMarkers.includes(".specnfc/indexes/project-index.json"));
    assert.ok(opencodeItem.missingMarkers.includes("specs/project/**/*.md"));
    assert.ok(opencodeItem.missingMarkers.includes("specs/changes/**/*.md"));
    assert.ok(json.data.compliance.advisoryIssues.includes("PROJECTION_DRIFT"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release --dry-run 在四工具入口与 skill-pack 完整同步时通过预检", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-projection-v3-release-clean-"));

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });

    const initResult = spawnSync(process.execPath, [path.join(sandboxRoot, "bin/specnfc.mjs"), "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    const releaseResult = spawnSync(process.execPath, [path.join(sandboxRoot, "scripts/release.mjs"), "--version", "9.9.13-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 0);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.data.releasePreflight.status, "passed");
    assert.equal(json.data.releasePreflight.blockingIssues.length, 0);
    assert.equal(json.data.releasePreflight.releaseGateIssues.length, 0);
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

function runCli(args, { cwd = PROJECT_ROOT } = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8"
  });
}

async function copyProjectForReleaseTest(targetRoot) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(PROJECT_ROOT);
  for (const entry of entries) {
    const source = path.join(PROJECT_ROOT, entry);
    const destination = path.join(targetRoot, entry);
    await cp(source, destination, {
      recursive: true,
      filter: (candidate) => {
        const relative = path.relative(PROJECT_ROOT, candidate).split(path.sep).join("/");
        return ![".git", "node_modules", "dist", ".nfc", ".omx", ".DS_Store"].some(
          (blocked) => relative === blocked || relative.startsWith(`${blocked}/`)
        );
      }
    });
  }
}
