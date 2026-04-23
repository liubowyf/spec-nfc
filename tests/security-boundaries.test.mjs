import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolvePathWithin } from "../src/kernel/paths.mjs";

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI_PATH = path.join(PROJECT_ROOT, "bin/specnfc.mjs");
const BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "scripts/bootstrap.mjs");

test("resolvePathWithin blocks parent traversal", () => {
  assert.throws(
    () => resolvePathWithin("/tmp/specnfc-root", "../escape.txt"),
    /路径超出允许边界/
  );
});

test("bootstrap rejects non-Spec-nfc repositories before running commands", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-boundary-"));

  try {
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ name: "not-spec-nfc", version: "1.0.0" }, null, 2),
      "utf8"
    );

    const result = spawnSync(process.execPath, [BOOTSTRAP_PATH, "--cwd", cwd, "--json"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8"
    });

    assert.notEqual(result.status, 0);
    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_BOOTSTRAP_ROOT");
    assert.match(json.error.message, /Spec nfc/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change create blocks unsafe changeStructure paths from escaping the change root", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-boundary-"));

  try {
    let result = runCli(["init", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.defaults.changeStructure = ["../escape.md"];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    result = runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.match(json.error.message, /路径超出允许边界/);
    const escapedPath = path.join(cwd, "specs/changes/escape.md");
    assert.equal(await pathExists(escapedPath), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change archive rejects tampered meta ids that do not match the change directory", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-archive-boundary-"));

  try {
    let result = runCli(["init", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"),
      "# 验收与交接\n\n## 验收范围\n\n- 核心路径已覆盖\n- 归档前置材料已齐备\n\n## 验证方式与结果\n\n- 手工验证：已完成\n- change handoff：可正常生成发布交接单\n\n## 剩余风险与结论\n\n- 当前无\n- 是否允许进入 handoff / archive：是\n\n## 交付与发布交接\n\n- 对外变更摘要：当前无\n- 发布关注点：当前无\n- 回退提示：按既有回退流程处理\n- 接手说明：无需额外交接\n\n## 提交说明\n\n- 变更摘要：用于校验归档边界\n- 风险说明：当前无\n- 验证记录：手工验证通过\n",
      "utf8"
    );

    result = runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const metaPath = path.join(cwd, "specs/changes/risk-device-link/meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    meta.id = "../escape";
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

    result = runCli(["change", "archive", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.match(json.error.message, /元信息 ID 与目录不一致/);
    assert.equal(await pathExists(path.join(cwd, "specs/archive/risk-device-link")), false);
    assert.equal(await pathExists(path.join(cwd, "specs/changes/risk-device-link")), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage rejects tampered meta ids that do not match the integration directory", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-boundary-"));

  try {
    let result = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(result.status, 0);

    result = runCli([
      "integration",
      "create",
      "account-risk-api",
      "--cwd",
      cwd,
      "--provider",
      "risk-engine",
      "--consumer",
      "account-service",
      "--changes",
      "risk-score-upgrade",
      "--json"
    ]);
    assert.equal(result.status, 0);

    const integrationRoot = path.join(cwd, "specs/integrations/account-risk-api");
    await writeFile(
      path.join(integrationRoot, "status.md"),
      "# 对接状态\n\n## 当前状态\n- 状态：`draft`\n- 更新时间：`2026-04-08T00:00:00.000Z`\n- 当前结论：已准备好推进。\n\n## 当前阻塞\n- 已清空\n\n## 已完成\n- 契约已对齐\n\n## 未完成\n- 待推进 aligned\n\n## 下一步\n- 下一动作：推进 aligned\n- 责任方：provider\n- 验证结论：已审阅\n",
      "utf8"
    );

    const metaPath = path.join(integrationRoot, "meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    meta.id = "../escape";
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.match(json.error.message, /对接元信息 ID 与目录不一致/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
