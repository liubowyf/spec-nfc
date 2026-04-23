import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertMatchesSchema } from "./helpers/json-schema-lite.mjs";
import { loadDesignSchema } from "./helpers/output-contracts.mjs";

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI_PATH = path.join(PROJECT_ROOT, "bin/specnfc.mjs");
const BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "scripts/bootstrap.mjs");
const RELEASE_PATH = path.join(PROJECT_ROOT, "scripts/release.mjs");
const PACKAGE_VERSION = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")).version;
const REAL_NPM_BIN = spawnSync("which", ["npm"], { cwd: PROJECT_ROOT, encoding: "utf8" }).stdout.trim() || "npm";

test("根命令 human 模式会输出帮助总览", () => {
  const result = runCli([]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Spec nfc：Spec-driven Coding 协议与 CLI 工具/);
  assert.match(result.stdout, /帮助内容/);
  assert.equal(result.stderr, "");
});

test("根命令帮助会列出 status", () => {
  const result = runCli([]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /status/);
  assert.match(result.stdout, /统一查看当前仓状态|查看当前仓状态/);
});

test("change --help 会输出 change 子命令说明", () => {
  const result = runCli(["change", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /change/);
  assert.match(result.stdout, /create|list|check|stage|handoff|archive/);
});

test("integration --help 会输出 integration 子命令说明", () => {
  const result = runCli(["integration", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /integration/);
  assert.match(result.stdout, /create|list|check|stage/);
  assert.match(result.stdout, /多人接口 \/ service 对接关系/);
});

test("status --help 会输出 status 命令说明", () => {
  const result = runCli(["status", "--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /specnfc status/);
  assert.match(result.stdout, /统一查看|仓级状态命令/);
  assert.match(result.stdout, /--json/);
});

test("status human 模式会输出总结、仓状态、change 总览和下一步建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-human-"));

  try {
    const initResult = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(initResult.status, 0);

    const result = runCli(["status", "--cwd", cwd]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /状态：健康空闲|状态：推进中|状态：需关注|状态：待交接/);
    assert.match(result.stdout, /总结/);
    assert.match(result.stdout, /仓库状态/);
    assert.match(result.stdout, /变更总览/);
    assert.match(result.stdout, /下一步建议/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 在配置损坏时返回 WRITE_DENIED 且符合 schema", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-invalid-config-regression-"));
  const errorSchema = await loadDesignSchema("error-output.schema.json");

  try {
    const initResult = runCli(["init", "--cwd", cwd, "--json"]);
    assert.equal(initResult.status, 0);

    await writeFile(path.join(cwd, ".specnfc/config.json"), "{invalid-json", "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 3);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.match(json.error.message, /JSON|Expected property name/);
    assertMatchesSchema(errorSchema, json, "upgrade-invalid-config");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 在 legacy change / integration 元信息损坏时输出 backfill 风险与人工动作且符合 schema", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-broken-legacy-meta-"));
  const upgradeSchema = await loadDesignSchema("upgrade-output.schema.json");

  try {
    const initResult = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(initResult.status, 0);

    await mkdir(path.join(cwd, "specs/changes/legacy-broken-change"), { recursive: true });
    await writeFile(path.join(cwd, "specs/changes/legacy-broken-change/meta.json"), "{invalid-json", "utf8");

    await mkdir(path.join(cwd, "specs/integrations/legacy-broken-integration"), { recursive: true });
    await writeFile(path.join(cwd, "specs/integrations/legacy-broken-integration/meta.json"), "{invalid-json", "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.supportAssessment.level, "out_of_scope");
    assert.ok(json.data.riskSummary.some((item) => item.code === "CHANGE_BACKFILL_SKIPPED"));
    assert.ok(json.data.riskSummary.some((item) => item.code === "INTEGRATION_BACKFILL_SKIPPED"));
    assert.ok(json.data.manualActions.some((item) => item.code === "REPAIR_LEGACY_CHANGE_META"));
    assert.ok(json.data.manualActions.some((item) => item.code === "REPAIR_LEGACY_INTEGRATION_META"));
    assertMatchesSchema(upgradeSchema, json, "upgrade-broken-legacy-meta");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("未知命令返回 INVALID_ARGS 与退出码 2", () => {
  const result = runCli(["unknown-command"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /执行失败：未识别的命令：unknown-command/);
  assert.match(result.stderr, /下一步建议/);
});

test("version --json 输出版本信息", () => {
  const result = runCli(["version", "--json"]);

  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.command, "version");
  assert.equal(json.data.specnfcVersion, PACKAGE_VERSION);
  assert.equal(json.data.templateVersion, json.data.specnfcVersion);
  assert.equal(json.data.protocolVersion, json.data.specnfcVersion);
});

test("explain 默认输出 overview 并标记已初始化仓", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-explain-overview-"));

  try {
    const initResult = runCli(["init", "--cwd", cwd, "--json"]);
    assert.equal(initResult.status, 0);

    const result = runCli(["explain", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.topic, "overview");
    assert.equal(json.data.initialized, true);
    assert.match(json.data.content, /Spec nfc/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("explain 未知主题返回 INVALID_ARGS", () => {
  const result = runCli(["explain", "missing-topic", "--json"]);

  assert.equal(result.status, 2);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "INVALID_ARGS");
  assert.match(json.error.message, /未找到说明主题：missing-topic/);
});

test("explain runtime 输出团队运行说明", () => {
  const result = runCli(["explain", "runtime", "--json"]);

  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.data.topic, "runtime");
  assert.match(json.data.content, /协作运行|团队运行/);
  assert.match(json.data.content, /收口|派单|回收/);
});

test("bootstrap --help 输出安装脚本说明", () => {
  const result = runBootstrap(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Spec nfc 一键安装脚本/);
  assert.match(result.stdout, /--dry-run/);
  assert.equal(result.stderr, "");
});

test("bootstrap 在 Node 版本过低时返回 NODE_VERSION_UNSUPPORTED 且符合 schema", async () => {
  const bootstrapSchema = await loadDesignSchema("bootstrap-output.schema.json");
  const runner = [
    "import { pathToFileURL } from 'node:url';",
    "Object.defineProperty(process.versions, 'node', { value: '18.0.0' });",
    `process.argv = ['node', ${JSON.stringify(BOOTSTRAP_PATH)}, '--json'];`,
    `await import(pathToFileURL(${JSON.stringify(BOOTSTRAP_PATH)}));`
  ].join("\n");

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", runner], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 1);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "NODE_VERSION_UNSUPPORTED");
  assert.match(json.error.message, /需要 >= 20/);
  assertMatchesSchema(bootstrapSchema, json, "bootstrap-node-version-unsupported");
});

test("release --help 输出覆盖保护与强制重建说明", () => {
  const result = spawnSync(process.execPath, [RELEASE_PATH, "--help"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Spec nfc npm 发布脚本/);
  assert.match(result.stdout, /--force/);
  assert.match(result.stdout, /默认拒绝覆盖|拒绝覆盖/);
});

test("release --dry-run 输出打包与安装校验计划", () => {
  const result = spawnSync(process.execPath, [RELEASE_PATH, "--dry-run", "--json"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.data.dryRun, true);
  assert.match(json.data.version, /^\d+\./);
  assert.ok(json.data.requiredManifests.some((item) => item.includes("src/templates/core/manifest.json")));
  assert.ok(json.data.steps.some((item) => item.id === "validate-manifests"));
  assert.ok(json.data.steps.some((item) => item.id === "assemble-npm-publish-view"));
  assert.ok(json.data.steps.some((item) => item.id === "pack-verify"));
  assert.ok(json.data.steps.some((item) => item.id === "verify-npm-install"));
  assert.ok(json.data.steps.some((item) => item.id === "verify-version"));
  assert.ok(json.data.steps.some((item) => item.id === "verify-doctor"));
  assert.ok(!json.data.steps.some((item) => item.id === "verify-demo"));
  assert.ok(json.data.steps.some((item) => item.id === "release-gate"));
  assert.ok(json.data.plannedArtifacts.includes("release-verification.json"));
  assert.ok(json.data.plannedArtifacts.includes("release-manifest.json"));
  assert.equal(json.data.releaseMode, "fast");
  assert.equal(json.data.verificationLevel, "smoke");
  assert.equal(json.data.distribution, "npm");
  assert.match(json.data.packageArtifact, /\.tgz$/);
  assert.equal(json.data.releasePreflight.status, "skipped");
});

test("release --dry-run --strict 会追加 demo 与发布回归步骤", () => {
  const result = spawnSync(process.execPath, [RELEASE_PATH, "--dry-run", "--strict", "--json"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.data.releaseMode, "strict");
  assert.equal(json.data.verificationLevel, "release");
  assert.ok(json.data.steps.some((item) => item.id === "verify-demo"));
  assert.ok(json.data.steps.some((item) => item.id === "verify-release-regression"));
  assert.ok(!json.data.steps.some((item) => item.id === "verify-full-test"));
});

test("release --dry-run --strict --full-test 会追加全量测试步骤", () => {
  const result = spawnSync(process.execPath, [RELEASE_PATH, "--dry-run", "--strict", "--full-test", "--json"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.data.releaseMode, "strict");
  assert.equal(json.data.verificationLevel, "full");
  assert.ok(json.data.steps.some((item) => item.id === "verify-release-regression"));
  assert.ok(json.data.steps.some((item) => item.id === "verify-full-test"));
});

test("release 会在已初始化仓的 projection drift 未豁免时阻断发布", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-gate-"));

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await writeFile(
      path.join(sandboxRoot, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.6-test", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /PROJECTION_DRIFT/);
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 会在 project summary 缺失时阻断发布", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-project-summary-gate-"));

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await rm(path.join(sandboxRoot, "specs/project/summary.md"), { force: true });

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.12-test", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /PROJECT_DOC_MISSING/);
    assert.match(json.error.details, /specs\/project\/summary\.md/);
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release --dry-run 在 projection drift、project summary 缺失与无效治理记录并存时一次性汇总全部阻断原因", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-composite-gates-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await writeFile(
      path.join(sandboxRoot, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );
    await rm(path.join(sandboxRoot, "specs/project/summary.md"), { force: true });
    await writeFile(
      path.join(sandboxRoot, ".specnfc/governance/release-decisions/invalid-release.json"),
      `${JSON.stringify(
        {
          recordId: "invalid-release",
          releaseTag: "v9.9.12c-test",
          decision: "approved",
          approver: "release-manager",
          changeRefs: [],
          integrationRefs: [],
          verificationRecordRefs: ["missing-qa-pass"],
          waiverRefs: ["missing-waiver"],
          createdAt: "2026-04-15T06:30:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.12c-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /PROJECTION_DRIFT/);
    assert.match(json.error.details, /PROJECT_DOC_MISSING/);
    assert.match(json.error.details, /specs\/project\/summary\.md/);
    assert.match(json.error.details, /GOVERNANCE_INVALID:1/);
    assertMatchesSchema(releaseSchema, json, "release-composite-gates-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release --dry-run 在存在 release candidate 但缺少 release-decision-record 时阻断", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-missing-decision-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await prepareReadyReleaseChange({ sandboxRoot, sandboxCli, changeId: "risk-device-link" });

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.14-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /RELEASE_DECISION_MISSING/);
    assert.match(json.error.details, /v9\.9\.14-test/);
    assertMatchesSchema(releaseSchema, json, "release-missing-decision-gate-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release --dry-run 在目标 release-decision 文件损坏时返回无效决策而不是误报缺失", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-invalid-decision-file-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await prepareReadyReleaseChange({ sandboxRoot, sandboxCli, changeId: "risk-device-link" });
    await writeFile(
      path.join(sandboxRoot, ".specnfc/governance/release-decisions/v9.9.14b-test.json"),
      "{invalid-json",
      "utf8"
    );

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.14b-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /RELEASE_DECISION_INVALID/);
    assert.match(json.error.details, /v9\.9\.14b-test\.json/);
    assert.doesNotMatch(json.error.details, /RELEASE_DECISION_MISSING/);
    assertMatchesSchema(releaseSchema, json, "release-invalid-decision-file-gate-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release --dry-run 在 release-decision 引用的 change 未完成 handoff 时阻断", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-unready-target-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await prepareVerifyingReleaseChange({ sandboxRoot, sandboxCli, changeId: "risk-device-link" });
    await writeReleaseDecisionRecord({
      sandboxRoot,
      releaseTag: "v9.9.15-test",
      changeRefs: ["risk-device-link"],
      integrationRefs: [],
      verificationRecordRefs: ["qa-pass"],
      waiverRefs: []
    });

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.15-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /RELEASE_CHANGE_NOT_READY/);
    assert.match(json.error.details, /risk-device-link/);
    assertMatchesSchema(releaseSchema, json, "release-unready-target-gate-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release --dry-run 在 release-decision 引用缺失的 verification / waiver 时阻断", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-invalid-decision-refs-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await prepareReadyReleaseChange({ sandboxRoot, sandboxCli, changeId: "risk-device-link" });
    await writeReleaseDecisionRecord({
      sandboxRoot,
      releaseTag: "v9.9.16-test",
      changeRefs: ["risk-device-link"],
      integrationRefs: [],
      verificationRecordRefs: ["missing-qa-pass"],
      waiverRefs: ["missing-waiver"]
    });

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.16-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /RELEASE_DECISION_VERIFICATION_REF_MISSING/);
    assert.match(json.error.details, /RELEASE_DECISION_WAIVER_REF_MISSING/);
    assertMatchesSchema(releaseSchema, json, "release-invalid-decision-refs-gate-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release --dry-run 在仓内存在无效治理记录时会被统一 compliance 门禁阻断", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-invalid-governance-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await prepareReadyReleaseChange({ sandboxRoot, sandboxCli, changeId: "risk-device-link" });
    await writeReleaseDecisionRecord({
      sandboxRoot,
      releaseTag: "v9.9.16a-test",
      changeRefs: ["risk-device-link"],
      integrationRefs: [],
      verificationRecordRefs: ["qa-pass"],
      waiverRefs: []
    });
    await writeFile(
      path.join(sandboxRoot, "specs/changes/risk-device-link/evidence/reviews/broken-scope-review.json"),
      `${JSON.stringify({
        recordId: "broken-scope-review",
        scope: "integration",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "故意制造 scope mismatch",
        evidenceRefs: ["specs/changes/risk-device-link/design.md"],
        createdAt: "2026-04-15T05:00:00.000Z"
      }, null, 2)}\n`,
      "utf8"
    );

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.16a-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /GOVERNANCE_INVALID:1/);
    assertMatchesSchema(releaseSchema, json, "release-invalid-governance-gate-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release --dry-run 在 skill-pack 漂移被有效 waiver 覆盖时返回 passed", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-skillpack-waived-"));

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    const manifestPath = path.join(sandboxRoot, ".specnfc/skill-packs/active/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "0.0.0-test";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await writeFile(
      path.join(sandboxRoot, ".specnfc/governance/waivers/skillpack-waiver.json"),
      `${JSON.stringify(
        {
          waiverId: "skillpack-waiver",
          scope: "repository",
          target: "SKILL_PACK_",
          reason: "允许临时 skill-pack 漂移，等待统一 refresh",
          approvedBy: "team-architect",
          validUntil: "2099-01-01T00:00:00.000Z",
          modeOverride: "guided",
          createdAt: "2026-04-13T00:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.5-test", "--dry-run", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 0);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.releasePreflight.status, "passed");
    assert.equal(json.data.releasePreflight.blockingIssues.length, 0);
    assert.equal(json.data.releasePreflight.releaseGateIssues.length, 0);
    assert.ok(json.data.releasePreflight.waivers.appliedIssueCodes.includes("SKILL_PACK_DRIFTED"));
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 会在 skill-pack 漂移只有过期 waiver 时继续阻断", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-expired-waiver-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    const manifestPath = path.join(sandboxRoot, ".specnfc/skill-packs/active/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "0.0.0-test";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await writeFile(
      path.join(sandboxRoot, ".specnfc/governance/waivers/expired-skillpack-waiver.json"),
      `${JSON.stringify(
        {
          waiverId: "expired-skillpack-waiver",
          scope: "repository",
          target: "SKILL_PACK_",
          reason: "测试过期 waiver",
          approvedBy: "team-architect",
          validUntil: "2020-01-01T00:00:00.000Z",
          modeOverride: "guided",
          createdAt: "2026-04-13T00:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.4-test", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /WAIVER_EXPIRED/);
    assert.match(json.error.details, /SKILL_PACK_DRIFTED/);
    assertMatchesSchema(releaseSchema, json, "release-expired-waiver-gate-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 会在存在无效 waiver 时阻断发布且输出符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-invalid-waiver-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    await rm(path.join(sandboxRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(sandboxRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(sandboxRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", sandboxRoot, "--profile", "enterprise", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await writeFile(
      path.join(sandboxRoot, ".specnfc/governance/waivers/invalid-waiver.json"),
      `${JSON.stringify(
        {
          waiverId: "invalid-waiver",
          scope: "repository",
          reason: "故意缺少 target 用于测试 release gate",
          approvedBy: "team-architect",
          createdAt: "2026-04-13T00:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const releaseResult = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.11-test", "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });
    assert.equal(releaseResult.status, 1);

    const json = JSON.parse(releaseResult.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_GATE_BLOCKED");
    assert.match(json.error.details, /WAIVER_INVALID/);
    assertMatchesSchema(releaseSchema, json, "release-invalid-waiver-gate-blocked");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 会产出机器可读发布清单", async () => {
  const version = "9.9.8-test";
  const releaseRoot = path.join(PROJECT_ROOT, "dist", "release", `v${version}`);

  try {
    const result = spawnSync(process.execPath, [RELEASE_PATH, "--version", version, "--json", "--force"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8"
    });

    assert.equal(result.status, 0);

    const manifest = JSON.parse(await readFile(path.join(releaseRoot, "release-manifest.json"), "utf8"));
    const verification = JSON.parse(await readFile(path.join(releaseRoot, "release-verification.json"), "utf8"));
    const packageEntries = spawnSync("tar", ["-tzf", path.join(releaseRoot, manifest.artifacts.packageArtifact)], {
      cwd: PROJECT_ROOT,
      encoding: "utf8"
    });

    assert.equal(manifest.version, version);
    assert.equal(manifest.releaseMode, "fast");
    assert.equal(manifest.verificationLevel, "smoke");
    assert.equal(manifest.distribution, "npm");
    assert.ok(Array.isArray(manifest.requiredManifests));
    assert.ok(manifest.artifacts.packageArtifact.endsWith(".tgz"));
    assert.ok(manifest.reportFiles.includes("release-verification.json"));
    assert.equal(verification.version, version);
    assert.equal(verification.packageArtifact.filename, "spec-nfc-9.9.8-test.tgz");
    assert.equal(verification.installVerification.summary.smokePassed, true);
    assert.equal(verification.installVerification.summary.demoPassed, false);
    assert.equal(verification.installVerification.summary.releaseRegressionPassed, false);
    assert.equal(verification.installVerification.smokeVerification.doctorInitialized, true);
    assert.equal(verification.installVerification.demoVerification, null);
    assert.equal(verification.installVerification.releaseRegressionVerification, null);
    assert.equal(packageEntries.status, 0);
    const entries = packageEntries.stdout.split("\n").filter(Boolean);
    assert.ok(!entries.some((entry) => /(^|\/)\._|^__MACOSX(\/|$)/.test(entry)));
    assert.ok(!entries.some((entry) => entry.startsWith("package/.omx/")));
    assert.ok(!entries.some((entry) => entry.startsWith("package/tests/")));
    assert.ok(!entries.some((entry) => entry.startsWith("package/docs/")));
    assert.ok(!entries.some((entry) => entry.startsWith("package/specs/")));
  } finally {
    await rm(releaseRoot, { recursive: true, force: true });
  }
});

test("release 在已存在同版本发布目录时默认拒绝覆盖", async () => {
  const version = "9.9.9-test";
  const releaseRoot = path.join(PROJECT_ROOT, "dist", "release", `v${version}`);
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  await mkdir(releaseRoot, { recursive: true });
  await writeFile(path.join(releaseRoot, "release-verification.json"), '{"ok":true}\n', "utf8");

  try {
    const result = spawnSync(process.execPath, [RELEASE_PATH, "--version", version, "--json"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RELEASE_DIR_EXISTS");
    assert.match(json.error.message, /--force/);
    assertMatchesSchema(releaseSchema, json, "release-dir-exists");
  } finally {
    await rm(releaseRoot, { recursive: true, force: true });
  }
});

test("release 在无法确定版本时返回 INVALID_VERSION 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-invalid-version-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const sandboxPackageJsonPath = path.join(sandboxRoot, "package.json");
    const sandboxPackageJson = JSON.parse(await readFile(sandboxPackageJsonPath, "utf8"));
    sandboxPackageJson.version = "";
    await writeFile(sandboxPackageJsonPath, `${JSON.stringify(sandboxPackageJson, null, 2)}\n`, "utf8");

    const result = spawnSync(process.execPath, [sandboxRelease, "--json"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_VERSION");
    assert.match(json.error.message, /无法确定发布版本/);
    assertMatchesSchema(releaseSchema, json, "release-invalid-version");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在生产包 staging 缺少 manifest 时返回 REQUIRED_FILES_MISSING 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-missing-manifest-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    await rm(path.join(sandboxRoot, "src/templates/core/manifest.json"), { force: true });

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.14-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "REQUIRED_FILES_MISSING");
    assert.match(json.error.message, /缺少必要文件/);
    assert.match(json.error.message, /src\/templates\/core\/manifest\.json/);
    assertMatchesSchema(releaseSchema, json, "release-required-files-missing");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在归档内容校验失败时返回 ARCHIVE_VALIDATION_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-archive-validation-failed-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "npm"),
      [
        "#!/bin/sh",
        'REAL_NPM=\"${REAL_NPM:-/usr/bin/npm}\"',
        'if [ \"$1\" = \"--version\" ]; then',
        '  exec \"$REAL_NPM\" \"$@\"',
        "fi",
        'if [ \"$1\" = \"pack\" ]; then',
        '  DEST=\"\"',
        '  PREV=\"\"',
        '  for ARG in \"$@\"; do',
        '    if [ \"$PREV\" = \"--pack-destination\" ]; then DEST=\"$ARG\"; fi',
        '    PREV=\"$ARG\"',
        "  done",
        '  : \"${DEST:?missing pack destination}\"',
        '  printf \"fake tgz\" > \"$DEST/spec-nfc-9.9.17-test.tgz\"',
        '  printf \'[{\"id\":\"spec-nfc@9.9.17-test\",\"name\":\"spec-nfc\",\"version\":\"9.9.17-test\",\"size\":8,\"unpackedSize\":8,\"shasum\":\"fake\",\"integrity\":\"fake\",\"filename\":\"spec-nfc-9.9.17-test.tgz\",\"files\":[{\"path\":\"package.json\"},{\"path\":\"bin/specnfc.mjs\"}]}]\\n\'',
        "  exit 0",
        "fi",
        'exec \"$REAL_NPM\" \"$@\"'
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "npm"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.17-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        REAL_NPM: REAL_NPM_BIN,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "ARCHIVE_VALIDATION_FAILED");
    assert.match(json.error.message, /npm pack 产物缺少必要文件/);
    assertMatchesSchema(releaseSchema, json, "release-archive-validation-failed");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在缺少发布依赖命令时返回 TOOL_MISSING 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-tool-missing-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.15-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: ""
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "TOOL_MISSING");
    assert.match(json.error.message, /发布依赖命令/);
    assertMatchesSchema(releaseSchema, json, "release-tool-missing");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在打包命令执行失败时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-command-failed-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "npm"),
      [
        "#!/bin/sh",
        'if [ \"$1\" = \"--version\" ]; then',
          "  exit 0",
        "fi",
        'echo \"fake npm failed\" >&2',
        "exit 1"
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "npm"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.16-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: fakeBin
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /生成 npm 发布产物失败/);
    assert.match(json.error.details || "", /fake npm failed/);
    assertMatchesSchema(releaseSchema, json, "release-command-failed");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在安装验证链路中的 demo 验证失败时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-demo-verify-failed-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "specnfc"),
      [
        "#!/bin/sh",
        'if [ \"$1\" = \"version\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"specnfcVersion\":\"9.9.18-test\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"demo\" ]; then',
        '  echo \"fake specnfc demo failed\" >&2',
        "  exit 1",
        "fi",
        'if [ \"$1\" = \"doctor\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"initialized\":true}}'",
        "  exit 0",
        "fi",
        "echo '{\"ok\":true}'",
        "exit 0"
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "specnfc"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.18-test", "--strict", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        REAL_NPM: REAL_NPM_BIN,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /npm 包 demo 验证失败/);
    assert.match(json.error.details || "", /fake specnfc demo failed/);
    assertMatchesSchema(releaseSchema, json, "release-demo-verify-failed");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在安装验证链路中的 doctor 验证失败时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-doctor-verify-failed-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "specnfc"),
      [
        "#!/bin/sh",
        'if [ \"$1\" = \"version\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"specnfcVersion\":\"9.9.19-test\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"demo\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"profile\":\"enterprise\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"doctor\" ]; then',
        '  echo \"fake specnfc doctor failed\" >&2',
        "  exit 1",
        "fi",
        "echo '{\"ok\":true}'",
        "exit 0"
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "specnfc"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.19-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        REAL_NPM: REAL_NPM_BIN,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /npm 包 doctor 验证失败/);
    assert.match(json.error.details || "", /fake specnfc doctor failed/);
    assertMatchesSchema(releaseSchema, json, "release-doctor-verify-failed");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在安装验证链路中的 npm install 失败时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-bootstrap-verify-failed-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "npm"),
      [
        "#!/bin/sh",
        'REAL_NPM=\"${REAL_NPM:-/usr/bin/npm}\"',
        'if [ \"$1\" = \"--version\" ]; then',
        '  exec \"$REAL_NPM\" \"$@\"',
        "fi",
        'if [ \"$1\" = \"pack\" ]; then',
        '  exec \"$REAL_NPM\" \"$@\"',
        "fi",
        'if [ \"$1\" = \"install\" ]; then',
        '  echo \"fake npm install failed\" >&2',
        "  exit 1",
        "fi",
        'exec \"$REAL_NPM\" \"$@\"'
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "npm"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.20-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        REAL_NPM: REAL_NPM_BIN,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /npm 包安装验证失败/);
    assert.match(json.error.details || "", /fake npm install failed/);
    assertMatchesSchema(releaseSchema, json, "release-bootstrap-verify-failed");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在安装验证链路中的 version 输出非法 JSON 时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-bootstrap-invalid-json-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "specnfc"),
      [
        "#!/bin/sh",
        'if [ \"$1\" = \"version\" ]; then',
        "  echo 'not-json'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"demo\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"profile\":\"enterprise\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"doctor\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"initialized\":true}}'",
        "  exit 0",
        "fi",
        "echo '{\"ok\":true}'",
        "exit 0"
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "specnfc"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.20b-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /npm 包全局命令验证输出不是合法 JSON/);
    assert.match(json.error.details || "", /version/);
    assertMatchesSchema(releaseSchema, json, "release-bootstrap-invalid-json");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在安装验证链路中的 version 返回 ok=false 时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-bootstrap-ok-false-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "specnfc"),
      [
        "#!/bin/sh",
        'if [ \"$1\" = \"version\" ]; then',
        "  echo '{\"ok\":false,\"error\":{\"code\":\"FAKE_VERSION_FAILED\",\"message\":\"semantic failure\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"demo\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"profile\":\"enterprise\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"doctor\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"initialized\":true}}'",
        "  exit 0",
        "fi",
        "echo '{\"ok\":true}'",
        "exit 0"
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "specnfc"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.20c-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /npm 包 全局命令验证返回失败结果/);
    assert.match(json.error.details || "", /FAKE_VERSION_FAILED/);
    assertMatchesSchema(releaseSchema, json, "release-bootstrap-ok-false");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在安装验证链路中的 version 版本号不匹配时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-version-mismatch-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "specnfc"),
      [
        "#!/bin/sh",
        'if [ \"$1\" = \"version\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"specnfcVersion\":\"0.0.0-mismatch\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"demo\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"profile\":\"enterprise\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"doctor\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"initialized\":true}}'",
        "  exit 0",
        "fi",
        "echo '{\"ok\":true}'",
        "exit 0"
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "specnfc"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.21-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        REAL_NPM: REAL_NPM_BIN,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /npm 包 全局命令版本校验失败/);
    assert.match(json.error.details || "", /expected=9\.9\.21-test/);
    assert.match(json.error.details || "", /actual=0\.0\.0-mismatch/);
    assertMatchesSchema(releaseSchema, json, "release-version-mismatch");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("release 在安装验证链路中的 doctor 未初始化时返回 COMMAND_FAILED 且符合 schema", async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-doctor-uninitialized-"));
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  try {
    await copyProjectForReleaseTest(sandboxRoot);
    const sandboxRelease = path.join(sandboxRoot, "scripts/release.mjs");
    const fakeBin = path.join(sandboxRoot, ".fake-bin");
    await mkdir(fakeBin, { recursive: true });

    await writeFile(
      path.join(fakeBin, "specnfc"),
      [
        "#!/bin/sh",
        'if [ \"$1\" = \"version\" ]; then',
        '  echo \'{"ok":true,"data":{"specnfcVersion":"9.9.22-test"}}\'',
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"demo\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"profile\":\"enterprise\"}}'",
        "  exit 0",
        "fi",
        'if [ \"$1\" = \"doctor\" ]; then',
        "  echo '{\"ok\":true,\"data\":{\"initialized\":false}}'",
        "  exit 0",
        "fi",
        "echo '{\"ok\":true}'",
        "exit 0"
      ].join("\n"),
      "utf8"
    );
    await chmod(path.join(fakeBin, "specnfc"), 0o755);

    const result = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.22-test", "--json", "--force"], {
      cwd: sandboxRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        REAL_NPM: REAL_NPM_BIN,
        SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE: "1",
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      }
    });

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "COMMAND_FAILED");
    assert.match(json.error.message, /npm 包 doctor 验证未得到已初始化仓/);
    assert.match(json.error.details || "", /initialized/);
    assertMatchesSchema(releaseSchema, json, "release-doctor-uninitialized");
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});

test("高价值脚本 JSON 输出实例符合 schema", async () => {
  const bootstrapSchema = await loadDesignSchema("bootstrap-output.schema.json");
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  const bootstrapDryRun = runBootstrap(["--dry-run", "--json"]);
  assert.equal(bootstrapDryRun.status, 0);
  assertMatchesSchema(bootstrapSchema, JSON.parse(bootstrapDryRun.stdout), "bootstrap-dry-run");

  const missingPackageRoot = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-schema-failure-"));
  try {
    const bootstrapFailure = runBootstrap(["--cwd", missingPackageRoot, "--json"]);
    assert.equal(bootstrapFailure.status, 1);
    assertMatchesSchema(bootstrapSchema, JSON.parse(bootstrapFailure.stdout), "bootstrap-failure");
  } finally {
    await rm(missingPackageRoot, { recursive: true, force: true });
  }

  const releaseDryRun = spawnSync(process.execPath, [RELEASE_PATH, "--dry-run", "--json"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });
  assert.equal(releaseDryRun.status, 0);
  assertMatchesSchema(releaseSchema, JSON.parse(releaseDryRun.stdout), "release-dry-run");

  const releaseVersion = "9.9.7-test";
  const releaseRoot = path.join(PROJECT_ROOT, "dist", "release", `v${releaseVersion}`);
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(path.join(releaseRoot, "release-verification.json"), '{"ok":true}\n', "utf8");
  try {
    const releaseFailure = spawnSync(process.execPath, [RELEASE_PATH, "--version", releaseVersion, "--json"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8"
    });
    assert.equal(releaseFailure.status, 1);
    assertMatchesSchema(releaseSchema, JSON.parse(releaseFailure.stdout), "release-failure");
  } finally {
    await rm(releaseRoot, { recursive: true, force: true });
  }
});

test("脚本级阻断与异常分支输出也符合 schema", async () => {
  const bootstrapSchema = await loadDesignSchema("bootstrap-output.schema.json");
  const releaseSchema = await loadDesignSchema("release-output.schema.json");

  const bootstrapRoot = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-schema-cli-failure-"));
  try {
    await writeFile(
      path.join(bootstrapRoot, "package.json"),
      JSON.stringify(
        {
          name: "spec-nfc",
          version: "1.0.0",
          private: true
        },
        null,
        2
      ),
      "utf8"
    );
    await mkdir(path.join(bootstrapRoot, "bin"), { recursive: true });
    await writeFile(
      path.join(bootstrapRoot, "bin/specnfc.mjs"),
      'console.error("fake local cli failed"); process.exit(1);\n',
      "utf8"
    );

    const bootstrapFailure = runBootstrap(["--cwd", bootstrapRoot, "--skip-test", "--skip-link", "--json"]);
    assert.equal(bootstrapFailure.status, 1);
    const bootstrapJson = JSON.parse(bootstrapFailure.stdout);
    assert.equal(bootstrapJson.error.code, "BOOTSTRAP_STEP_FAILED");
    assertMatchesSchema(bootstrapSchema, bootstrapJson, "bootstrap-verify-local-cli-failure");
  } finally {
    await rm(bootstrapRoot, { recursive: true, force: true });
  }

  const releaseRoot = await mkdtemp(path.join(tmpdir(), "specnfc-release-schema-gate-blocked-"));
  try {
    await copyProjectForReleaseTest(releaseRoot);
    await rm(path.join(releaseRoot, "specs", "changes"), { recursive: true, force: true });
    await rm(path.join(releaseRoot, "specs", "integrations"), { recursive: true, force: true });
    const sandboxCli = path.join(releaseRoot, "bin/specnfc.mjs");
    const sandboxRelease = path.join(releaseRoot, "scripts/release.mjs");

    const initResult = spawnSync(process.execPath, [sandboxCli, "init", "--cwd", releaseRoot, "--profile", "enterprise", "--json"], {
      cwd: releaseRoot,
      encoding: "utf8"
    });
    assert.equal(initResult.status, 0);

    await writeFile(
      path.join(releaseRoot, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );

    const releaseFailure = spawnSync(process.execPath, [sandboxRelease, "--version", "9.9.10-test", "--json"], {
      cwd: releaseRoot,
      encoding: "utf8"
    });
    assert.equal(releaseFailure.status, 1);
    const releaseJson = JSON.parse(releaseFailure.stdout);
    assert.equal(releaseJson.error.code, "RELEASE_GATE_BLOCKED");
    assertMatchesSchema(releaseSchema, releaseJson, "release-gate-blocked");
  } finally {
    await rm(releaseRoot, { recursive: true, force: true });
  }
});

test("bootstrap 在缺少 package.json 时返回结构化错误", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-missing-package-"));

  try {
    const result = runBootstrap(["--cwd", cwd, "--json"]);

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PACKAGE_JSON_MISSING");
    assert.match(json.error.message, /package\.json/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bootstrap 在 package.json 非法时返回 INVALID_PACKAGE_JSON 且符合 schema", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-invalid-package-json-"));
  const bootstrapSchema = await loadDesignSchema("bootstrap-output.schema.json");

  try {
    await writeFile(path.join(cwd, "package.json"), "{ invalid json }\n", "utf8");

    const result = runBootstrap(["--cwd", cwd, "--json"]);

    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_PACKAGE_JSON");
    assert.match(json.error.message, /package\.json/);
    assertMatchesSchema(bootstrapSchema, json, "bootstrap-invalid-package-json");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bootstrap human 模式会拦截缺少本地 CLI 的伪源码仓", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-missing-cli-"));

  try {
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "spec-nfc",
          version: "1.0.0",
          private: true
        },
        null,
        2
      ),
      "utf8"
    );

    const result = runBootstrap(["--cwd", cwd, "--skip-test", "--skip-link"]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^\n安装失败：/);
    assert.match(result.stderr, /bootstrap 只允许在完整的 Spec nfc 源码仓根目录执行/);
    assert.match(result.stderr, /细节：/);
    assert.match(result.stderr, /package.name=spec-nfc/);
    assert.match(result.stderr, /missingCli=true/);
    assert.match(result.stderr, /建议：先执行 `node \.\/scripts\/bootstrap\.mjs --dry-run` 检查步骤，再处理环境问题。/);
    assert.doesNotMatch(result.stderr, /undefined|null/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bootstrap 在伪源码仓 JSON 模式下返回 INVALID_BOOTSTRAP_ROOT 且符合 schema", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-invalid-root-json-"));
  const bootstrapSchema = await loadDesignSchema("bootstrap-output.schema.json");

  try {
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "spec-nfc",
          version: "1.0.0",
          private: true
        },
        null,
        2
      ),
      "utf8"
    );

    const result = runBootstrap(["--cwd", cwd, "--skip-test", "--skip-link", "--json"]);
    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_BOOTSTRAP_ROOT");
    assert.match(json.error.message, /完整的 Spec nfc 源码仓根目录/);
    assert.match(json.error.details || "", /missingCli=true/);
    assertMatchesSchema(bootstrapSchema, json, "bootstrap-invalid-root-json");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("bootstrap 在本地 CLI 校验失败时返回失败步骤与证据", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-bootstrap-failed-cli-"));

  try {
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify(
        {
          name: "spec-nfc",
          version: "1.0.0",
          private: true
        },
        null,
        2
      ),
      "utf8"
    );
    await mkdir(path.join(cwd, "bin"), { recursive: true });
    await writeFile(
      path.join(cwd, "bin/specnfc.mjs"),
      'console.error("fake local cli failed"); process.exit(1);\n',
      "utf8"
    );

    const result = runBootstrap(["--cwd", cwd, "--skip-test", "--skip-link", "--json"]);
    assert.equal(result.status, 1);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "BOOTSTRAP_STEP_FAILED");
    assert.equal(json.error.failedStep, "verify-local-cli");
    assert.equal(json.data.steps.at(-1).status, "failed");
    assert.match(json.data.steps.at(-1).stderr || "", /fake local cli failed/);
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

function runBootstrap(args) {
  return spawnSync(process.execPath, [BOOTSTRAP_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });
}

async function copyProjectForReleaseTest(targetRoot) {
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

async function prepareVerifyingReleaseChange({ sandboxRoot, sandboxCli, changeId }) {
  let result = spawnSync(process.execPath, [sandboxCli, "change", "create", changeId, "--cwd", sandboxRoot, "--json"], {
    cwd: sandboxRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0);

  await fillChangeForExecutionForReleaseTest(sandboxRoot, changeId);
  await writeGovernanceRecordForReleaseTest(sandboxRoot, {
    scope: "change",
    targetId: changeId,
    type: "review",
    fileName: "design-review.json",
    payload: {
      recordId: "design-review",
      scope: "change",
      targetId: changeId,
      stage: "design",
      reviewType: "design",
      reviewer: "architect",
      verdict: "approved",
      summary: "设计评审通过",
      evidenceRefs: [`specs/changes/${changeId}/design.md`],
      createdAt: "2026-04-15T10:00:00.000Z"
    }
  });
  await writeGovernanceRecordForReleaseTest(sandboxRoot, {
    scope: "change",
    targetId: changeId,
    type: "verification",
    fileName: "qa-pass.json",
    payload: {
      recordId: "qa-pass",
      scope: "change",
      targetId: changeId,
      stage: "verify",
      verificationType: "tests",
      executor: "qa",
      result: "passed",
      evidenceRefs: ["tests/cli.test.mjs"],
      summary: "验证通过",
      createdAt: "2026-04-15T10:10:00.000Z"
    }
  });
  await writeGovernanceRecordForReleaseTest(sandboxRoot, {
    scope: "change",
    targetId: changeId,
    type: "approval",
    fileName: "handoff-approval.json",
    payload: {
      recordId: "handoff-approval",
      scope: "change",
      targetId: changeId,
      stage: "accept",
      approvalType: "handoff",
      approver: "tech-lead",
      decision: "approved",
      reviewRecordRefs: ["design-review"],
      verificationRecordRefs: ["qa-pass"],
      createdAt: "2026-04-15T10:20:00.000Z"
    }
  });

  result = spawnSync(process.execPath, [sandboxCli, "change", "stage", changeId, "--cwd", sandboxRoot, "--to", "in-progress", "--json"], {
    cwd: sandboxRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0);
  result = spawnSync(process.execPath, [sandboxCli, "change", "stage", changeId, "--cwd", sandboxRoot, "--to", "verifying", "--json"], {
    cwd: sandboxRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0);
}

async function prepareReadyReleaseChange({ sandboxRoot, sandboxCli, changeId }) {
  await prepareVerifyingReleaseChange({ sandboxRoot, sandboxCli, changeId });
  const result = spawnSync(process.execPath, [sandboxCli, "change", "handoff", changeId, "--cwd", sandboxRoot, "--json"], {
    cwd: sandboxRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0);
}

async function fillChangeForExecutionForReleaseTest(sandboxRoot, changeId) {
  const changeRoot = path.join(sandboxRoot, "specs/changes", changeId);
  await writeFile(
    path.join(changeRoot, "01-需求与方案.md"),
    `# 需求与方案

## 问题定义

本次发布校验需要一个可进入 release gate 的标准 change，用于验证发布门禁、治理记录与发布决策链路。

## 目标

- 补齐 release gate 所需的正式文档
- 让 change 能顺利进入 verifying / handoff
- 为 release decision 提供可验证的事实依据

## 范围

覆盖需求边界、方案结论、执行状态、验收结论与发布交接；不扩展额外业务能力。

## 方案结论

采用四主文档作为正式事实源，legacy 文档仅保留兼容验证所需内容。

## 澄清确认记录

- 当前轮次：4
- 最近一次确认问题：是否确认以四主文档作为正式事实源？
- 最近一次用户答复摘要：确认按四主文档推进。
- 当前选择是否已确认：是
- 尚待确认事项：无

## 验收口径

change stage 能推进到 verifying / handoff，release --dry-run 能按预期命中对应门禁。
`,
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "02-技术设计与选型.md"),
    `# 技术设计与选型

## 设计目标

确保发布门禁只依赖仓内正式文档、治理记录与 release decision。

## 约束

不引入额外外部依赖；保留对 legacy change 文档的兼容读取。

## 候选路线

### 路线一：继续依赖 legacy 文档

实现简单，但会让发布门禁与默认文档结构继续分裂。

### 路线二：以四主文档为主，legacy 文档仅做兼容

能保证 3.1 默认结构与 release gate 一致，本次采用该路线。

## 选型结论

当前采用路线二，发布门禁以四主文档和治理证据为准。

## 设计确认记录

- 当前轮次：4
- 最近一次确认问题：是否确认采用路线二作为发布门禁主线？
- 最近一次用户答复摘要：确认采用路线二。
- 选型结论是否已确认：是
- 尚待确认事项：无
`,
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "03-任务计划与执行.md"),
    `# 任务计划与执行

## 任务拆分

1. 补齐正式文档
2. 写入治理 review / verification / approval
3. 推进 change 到 verifying / handoff
4. 执行 release dry-run 校验

## 当前状态

当前结论：本 change 已完成发布前置准备，可进入 verifying / handoff。

最近更新：已补治理记录与交付文档，准备执行发布门禁回归。

## 风险与验证

- 主要风险：legacy 文档与新文档结构不一致会导致门禁误判
- 当前验证：通过 change stage / release --dry-run 回归验证

## 下一步

下一步动作：生成 handoff，并执行 release dry-run。
`,
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "04-验收与交接.md"),
    `# 验收与交接

## 验收范围

- change 主文档完整
- 治理记录齐备
- 发布门禁可读取当前 change 事实

## 验证方式与结果

- change stage：可进入 verifying / handoff
- release --dry-run：按预期命中或通过门禁
- 人工复核：确认发布材料与治理记录一致

## 剩余风险与结论

剩余风险：仅保留对 legacy 材料的兼容维护成本；当前无阻断风险。

结论：当前 change 满足 release 前置要求。是否允许进入 handoff / archive：是。

## 交付与发布交接

交付重点是保证发布决策记录、治理证据和正式文档一致，发布后按流程归档。

## 提交说明

提交应聚焦发布门禁验证这一单一意图，明确验证结果与风险结论。
`,
    "utf8"
  );
  await writeFile(path.join(changeRoot, "proposal.md"), "# Proposal\n\n已完成问题定义。\n", "utf8");
  await writeFile(path.join(changeRoot, "design.md"), "# Design\n\n已完成设计。\n", "utf8");
  await writeFile(path.join(changeRoot, "spec.md"), "# Spec\n\n已完成规格。\n", "utf8");
  await writeFile(path.join(changeRoot, "capabilities.md"), "# Capabilities\n\n已完成能力影响分析。\n", "utf8");
  await writeFile(path.join(changeRoot, "spec-deltas.md"), "# Spec Deltas\n\n已完成规格增量说明。\n", "utf8");
  await writeFile(path.join(changeRoot, "plan.md"), "# Plan\n\n已完成实现计划。\n", "utf8");
  await writeFile(path.join(changeRoot, "tasks.md"), "# Tasks\n\n- [x] 已完成任务拆解。\n", "utf8");
  await writeFile(path.join(changeRoot, "decisions.md"), "# Decisions\n\n已记录关键决策。\n", "utf8");
  await writeFile(path.join(changeRoot, "status.md"), "# Status\n\n当前已完成验证，准备交接。\n", "utf8");
  await writeFile(
    path.join(changeRoot, "acceptance.md"),
    "# 验收记录\n\n## 验收范围\n\n- 核心功能已覆盖\n\n## 验证方式\n\n- 单元测试：已执行\n- 手工验证：已完成\n\n## 测试 / 验证结果\n\n- 结果 1：通过\n\n## 剩余风险\n\n- 当前无\n\n## 结论\n\n- 是否满足当前阶段要求：是\n- 是否允许进入 accept / archive：是\n",
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "commit-message.md"),
    "# 提交说明草稿\n\n```text\nfeature: risk-device-link 设备关联风险识别增强\n\nSummary:\n- 完成实现与验证\n\nRisks:\n- 当前无\n\nValidation:\n- release gate regression\n```\n",
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "delivery-checklist.md"),
    `# 交付自检\n\n## 基本信息\n\n- Change：\`${changeId}\`\n- 标题：设备关联风险识别增强\n- 类型：\`feature\`\n- 当前阶段：\`draft\`\n\n## 提交前\n\n- [x] \`proposal / design / spec / capabilities / spec-deltas / plan / tasks / decisions / status\` 已同步\n- [x] 本次提交只覆盖一个清晰意图\n- [x] 已补验证结果\n\n## 推送前\n\n- [x] 当前分支与 \`change-id\` 对应正确\n- [x] 风险与未完成项已写明\n- [x] 如需他人继续接手，已在正式文件写明\n\n## 交接前\n\n- [ ] 如需发布交接，\`release-handoff.md\` 已补齐\n- [x] 下游不需要依赖聊天记录\n\n## 归档前\n\n- [ ] 当前变更已完成交付，可进入归档\n`,
    "utf8"
  );
}

async function writeGovernanceRecordForReleaseTest(sandboxRoot, { scope, targetId, type, fileName, payload }) {
  const scopeRoot = scope === "change" ? "changes" : "integrations";
  const typeDir = type === "review" ? "reviews" : type === "approval" ? "approvals" : "verifications";
  await writeFile(
    path.join(sandboxRoot, "specs", scopeRoot, targetId, "evidence", typeDir, fileName),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

async function writeReleaseDecisionRecord({ sandboxRoot, releaseTag, changeRefs, integrationRefs, verificationRecordRefs, waiverRefs }) {
  const fileName = `${releaseTag}.json`;
  await writeFile(
    path.join(sandboxRoot, ".specnfc/governance/release-decisions", fileName),
    `${JSON.stringify(
      {
        recordId: `${releaseTag}-decision`,
        releaseTag,
        decision: "approved",
        approver: "release-manager",
        changeRefs,
        integrationRefs,
        verificationRecordRefs,
        waiverRefs,
        createdAt: "2026-04-15T10:30:00.000Z"
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
