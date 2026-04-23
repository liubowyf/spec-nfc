#!/usr/bin/env node

import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectRepository } from "../src/kernel/scaffold.mjs";
import { inspectGovernanceTarget } from "../src/kernel/governance-records.mjs";
import { inspectChanges } from "../src/workflow/changes.mjs";
import { inspectIntegrations } from "../src/workflow/integrations.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const PACKAGE_ROOT_NAME = "spec-nfc";
const options = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
const version = String(options.version || packageJson.version || "").trim();
const releaseTag = `v${version}`;
const releaseDir = path.join(PROJECT_ROOT, "dist", "release", releaseTag);
const releaseMode = options.strict ? "strict" : "fast";
const verificationLevel = options.fullTest ? "full" : options.strict ? "release" : "smoke";
const distribution = "npm";
const packageArtifact = `${normalizeNpmPackName(packageJson.name || PACKAGE_ROOT_NAME)}-${version}.tgz`;
const requiredManifests = listRelativeTemplateManifests(PROJECT_ROOT);
const publicAssemblyConfig = readAssemblyConfig();
const reportFiles = ["release-manifest.json", "release-verification.json"];
const plannedArtifacts = [packageArtifact, ...reportFiles];
let releasePreflight = null;

if (options.help) {
  printHelp();
  process.exit(0);
}

if (!version) {
  finishError("INVALID_VERSION", "无法确定发布版本，请先检查 package.json 或显式传入 --version");
}

releasePreflight = await evaluateReleasePreflight(PROJECT_ROOT);

const steps = [
  { id: "release-gate", label: "检查仓级发布门禁" },
  { id: "validate-manifests", label: "校验模板 manifest 完整性" },
  { id: "prepare-release-dir", label: "准备发布目录" },
  { id: "assemble-npm-publish-view", label: "生成 npm 公开发布视图" },
  { id: "pack-verify", label: "校验 npm 包公开边界" },
  { id: "npm-pack", label: "生成 npm 发布产物" },
  { id: "verify-package-contents", label: "校验 npm 包内容完整性" },
  { id: "verify-npm-install", label: "从 npm 包安装并验证" },
  { id: "verify-version", label: "校验安装后的 version 命令" },
  { id: "verify-doctor", label: "校验安装后的 doctor 命令" },
  ...(options.strict
    ? [
        { id: "verify-demo", label: "校验安装后的 demo 命令" },
        { id: "verify-release-regression", label: "执行安装后的发布回归测试集" }
      ]
    : []),
  ...(options.fullTest
    ? [
        { id: "verify-full-test", label: "执行安装后的全量 npm test" }
      ]
    : [])
];

if (options.dryRun) {
  assertReleasePreflight(releasePreflight);
  finishSuccess({
    dryRun: true,
    releaseMode,
    verificationLevel,
    distribution,
    version,
    releaseDir: toRelative(releaseDir),
    packageArtifact,
    requiredManifests,
    plannedArtifacts,
    releasePreflight,
    steps
  });
  process.exit(0);
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "specnfc-release-"));

try {
  assertReleasePreflight(releasePreflight);
  ensureTool("npm", ["--version"]);

  assertReleaseTargetWritable(releaseDir);
  resetDirectory(releaseDir);
  const assemblyOutputRoot = path.join(tempRoot, "assembled-public");
  const stagingRoot = assemblePublicTarget({
    outputRoot: assemblyOutputRoot,
    targetName: "npm-publish"
  });
  validateRequiredPaths(stagingRoot, requiredManifests);
  syncStagingPackageVersion({ stagingRoot, version });
  const packInfo = createNpmPackage({
    stagingRoot,
    releaseDir,
    expectedArtifact: packageArtifact
  });
  validatePackedBoundary(packInfo.files, publicAssemblyConfig.audit || {});
  validatePackageEntries(packInfo.files, requiredManifests, "npm pack 产物缺少必要文件");

  const installVerification = verifyInstalledPackage({
    packageArtifactPath: path.join(releaseDir, packInfo.filename),
    expectedVersion: version,
    releaseMode
  });

  const verificationReport = {
    version,
    releaseMode,
    verificationLevel,
    distribution,
    generatedAt: new Date().toISOString(),
    requiredManifests,
    packageArtifact: {
      filename: packInfo.filename,
      size: packInfo.size ?? null,
      unpackedSize: packInfo.unpackedSize ?? null,
      shasum: packInfo.shasum ?? null,
      integrity: packInfo.integrity ?? null,
      fileCount: Array.isArray(packInfo.files) ? packInfo.files.length : null
    },
    installVerification
  };
  const releaseManifest = {
    version,
    releaseMode,
    verificationLevel,
    distribution,
    releaseTag,
    generatedAt: verificationReport.generatedAt,
    releaseDir: toRelative(releaseDir),
    requiredManifests,
    artifacts: {
      packageArtifact: packInfo.filename
    },
    reportFiles,
    installVerificationStatus: installVerification.summary
  };
  writeFileSync(path.join(releaseDir, "release-manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
  writeFileSync(path.join(releaseDir, "release-verification.json"), `${JSON.stringify(verificationReport, null, 2)}\n`, "utf8");

  finishSuccess({
    dryRun: false,
    releaseMode,
    verificationLevel,
    distribution,
    version,
    releaseDir: toRelative(releaseDir),
    packageArtifact: packInfo.filename,
    requiredManifests,
    plannedArtifacts,
    reportFiles,
    releasePreflight,
    installVerification,
    steps
  });
} catch (error) {
  finishError(
    error?.code || "RELEASE_FAILED",
    error instanceof Error ? error.message : String(error),
    error instanceof Error && "details" in error ? error.details : ""
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = {
    help: false,
    json: false,
    dryRun: false,
    force: false,
    strict: false,
    fullTest: false,
    version: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }
    if (value === "--json") {
      parsed.json = true;
      continue;
    }
    if (value === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (value === "--force") {
      parsed.force = true;
      continue;
    }
    if (value === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (value === "--full-test") {
      parsed.fullTest = true;
      parsed.strict = true;
      continue;
    }
    if (value === "--version") {
      parsed.version = argv[index + 1] || null;
      index += 1;
    }
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`Spec nfc npm 发布脚本

用法：
  node ./scripts/release.mjs [--version <x.y.z>] [--dry-run] [--json] [--force] [--strict] [--full-test]

默认行为：
  0. 若当前仓已初始化，则先执行仓级协议门禁检查
  1. 校验 src/templates/*/manifest.json 全量存在
  2. 生成 npm 公开发布视图并执行 pack-verify
  3. 生成 npm pack 产物（.tgz）
  4. 校验 npm 包内 manifest 完整性
  5. 从 npm 包完成一次安装验证并输出 release-verification.json
  6. 默认只校验 version / doctor
  7. 显式传入 --strict 时，追加 demo 与源码仓发布回归（npm run test:release）
  8. 显式传入 --full-test 时，再在 --strict 基础上追加源码仓全量 npm test

正式发布口径（自 v3.2.1 起）：
  - 团队对外安装统一走 npm：npm install -g spec-nfc@<version>
  - 不再生成 tar / zip 本地发布包
  - 发布完成后还需执行 npm view spec-nfc version 进行版本确认

保护规则：
  - 已存在同版本发布目录时默认拒绝覆盖
  - 只有显式传入 --force 才允许覆盖重建
`);
}

function listRelativeTemplateManifests(projectRoot) {
  const templatesRoot = path.join(projectRoot, "src", "templates");
  return readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.posix.join("src", "templates", entry.name, "manifest.json"))
    .sort();
}

function readAssemblyConfig() {
  const configPath = path.join(PROJECT_ROOT, "public", "assembly.config.json");
  if (!existsSync(configPath)) {
    return {
      audit: {
        blacklistTerms: [],
        whitelistTerms: []
      }
    };
  }
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function assemblePublicTarget({ outputRoot, targetName }) {
  const assembleScript = path.join(SCRIPT_DIR, "assemble-public.mjs");
  const result = runCommand(
    process.execPath,
    [assembleScript, "--target", targetName, "--output-root", outputRoot, "--json"],
    PROJECT_ROOT,
    "生成 npm 公开发布视图失败"
  );
  const payload = parseJsonCommandOutput({
    stdout: result.stdout,
    label: "公开装配",
    commandHint: "assemble-public"
  });
  const targetRoot = payload?.targets?.[targetName]?.root;
  if (!targetRoot) {
    const error = new Error(`公开装配结果缺少 ${targetName} root`);
    error.code = "PUBLIC_ASSEMBLY_INVALID";
    error.details = JSON.stringify(payload ?? null);
    throw error;
  }
  return path.resolve(PROJECT_ROOT, targetRoot);
}

function resetDirectory(targetPath) {
  rmSync(targetPath, { recursive: true, force: true });
  mkdirSync(targetPath, { recursive: true });
}

function assertReleasePreflight(preflight) {
  if (preflight.status !== "blocked") {
    return;
  }

  const details = [
    ...preflight.blockingIssues.map((item) => `阻塞：${item}`),
    ...preflight.releaseGateIssues.map((item) => `发布门禁：${item}`),
    ...preflight.recommendedActions.map((item) => `建议：${item}`)
  ].join("\n");
  finishError("RELEASE_GATE_BLOCKED", preflight.summary, details);
}

function assertReleaseTargetWritable(targetPath) {
  if (!existsSync(targetPath)) {
    return;
  }

  const entries = readdirSync(targetPath);
  if (entries.length === 0) {
    return;
  }

  if (options.force) {
    return;
  }

  const error = new Error(`发布目录已存在且包含内容：${toRelative(targetPath)}。如需覆盖重建，请显式传入 --force。`);
  error.code = "RELEASE_DIR_EXISTS";
  throw error;
}

function validateRequiredPaths(stagingRoot, manifestPaths) {
  const requiredPaths = [
    "package.json",
    "bin/specnfc.mjs",
    "src/cli/runner.mjs",
    "src/kernel/scaffold.mjs",
    "skill-packs/specnfc-zh-cn-default/manifest.json",
    ".specnfc/design/repo-contract.schema.json",
    ...manifestPaths
  ];

  const missing = requiredPaths.filter((item) => !existsSync(path.join(stagingRoot, item)));
  if (missing.length) {
    const error = new Error(`生产包 staging 缺少必要文件：${missing.join("、")}`);
    error.code = "REQUIRED_FILES_MISSING";
    throw error;
  }
}

function ensureTool(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const error = new Error(`当前环境缺少发布依赖命令：${command}`);
    error.code = "TOOL_MISSING";
    throw error;
  }
}

function validatePackageEntries(entries, manifestPaths, message) {
  const requiredEntries = [
    "package.json",
    "bin/specnfc.mjs",
    "src/cli/runner.mjs",
    "src/kernel/scaffold.mjs",
    "skill-packs/specnfc-zh-cn-default/manifest.json",
    ".specnfc/design/repo-contract.schema.json",
    ...manifestPaths
  ];
  const normalizedEntries = (entries || []).map((item) => typeof item === "string" ? item : item?.path).filter(Boolean);
  const entrySet = new Set(normalizedEntries);
  const missing = requiredEntries.filter((item) => !entrySet.has(item));
  if (missing.length) {
    const error = new Error(`${message}：${missing.join("、")}`);
    error.code = "ARCHIVE_VALIDATION_FAILED";
    throw error;
  }
}

function validatePackedBoundary(entries, auditConfig = {}) {
  const blockedPrefixes = [
    ".omx/",
    ".serena/",
    ".nfc/",
    "docs/",
    "dist/",
    "tests/",
    "specs/",
    "examples/",
    "scripts/release.mjs"
  ];
  const normalizedEntries = (entries || []).map((item) => typeof item === "string" ? item : item?.path).filter(Boolean);
  const blocked = normalizedEntries.filter((file) => blockedPrefixes.some((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix)));
  const whitelist = new Set(auditConfig.whitelistTerms || []);
  const blacklistHits = normalizedEntries.flatMap((file) =>
    (auditConfig.blacklistTerms || [])
      .filter((term) => file.includes(term) && !whitelist.has(term))
      .map((term) => ({ file, term }))
  );

  if (blocked.length === 0 && blacklistHits.length === 0) {
    return;
  }

  const error = new Error("npm 公开包边界校验失败");
  error.code = "COMMAND_FAILED";
  error.details = JSON.stringify({
    blockedFiles: blocked,
    sensitiveHits: blacklistHits
  });
  throw error;
}

function createNpmPackage({ stagingRoot, releaseDir, expectedArtifact }) {
  const result = runCommand("npm", ["pack", "--json", "--pack-destination", releaseDir], stagingRoot, "生成 npm 发布产物失败");
  let json;
  try {
    json = JSON.parse(result.stdout);
  } catch (error) {
    const parseError = new Error("npm pack 输出不是合法 JSON");
    parseError.code = "COMMAND_FAILED";
    parseError.details = error instanceof Error ? error.message : String(error);
    throw parseError;
  }

  const packInfo = Array.isArray(json) ? json[0] : null;
  if (!packInfo?.filename) {
    const error = new Error("npm pack 未返回产物信息");
    error.code = "COMMAND_FAILED";
    error.details = result.stdout;
    throw error;
  }

  if (expectedArtifact && packInfo.filename !== expectedArtifact) {
    const error = new Error("npm pack 产物名与预期版本不一致");
    error.code = "COMMAND_FAILED";
    error.details = `expected=${expectedArtifact} actual=${packInfo.filename}`;
    throw error;
  }

  return packInfo;
}

function syncStagingPackageVersion({ stagingRoot, version: targetVersion }) {
  const packageJsonPath = path.join(stagingRoot, "package.json");
  const stagedPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (stagedPackageJson.version !== targetVersion) {
    stagedPackageJson.version = targetVersion;
    writeFileSync(packageJsonPath, `${JSON.stringify(stagedPackageJson, null, 2)}\n`, "utf8");
  }

  const packageLockPath = path.join(stagingRoot, "package-lock.json");
  if (!existsSync(packageLockPath)) {
    return;
  }

  try {
    const stagedLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
    if (stagedLock.version !== targetVersion) {
      stagedLock.version = targetVersion;
    }
    if (stagedLock.packages?.[""] && typeof stagedLock.packages[""] === "object") {
      stagedLock.packages[""].version = targetVersion;
      if (typeof stagedPackageJson.name === "string" && stagedPackageJson.name) {
        stagedLock.packages[""].name = stagedPackageJson.name;
      }
    }
    writeFileSync(packageLockPath, `${JSON.stringify(stagedLock, null, 2)}\n`, "utf8");
  } catch {
    // package-lock 仅用于 staging 完整性，若结构不兼容则维持原样。
  }
}

function verifyInstalledPackage({ packageArtifactPath, expectedVersion, releaseMode }) {
  const installRoot = mkdtempSync(path.join(os.tmpdir(), "specnfc-release-install-"));
  try {
    const npmPrefix = path.join(installRoot, "prefix");
    mkdirSync(npmPrefix, { recursive: true });
    runCommand("npm", ["install", "-g", packageArtifactPath, "--prefix", npmPrefix], installRoot, "npm 包安装验证失败");

    const specnfcCommand = getInstalledSpecnfcCommand(npmPrefix);
    const versionResult = runCommand(specnfcCommand.command, [...specnfcCommand.baseArgs, "version", "--json"], installRoot, "npm 包全局命令验证失败", specnfcCommand.env);
    const versionJson = parseJsonCommandOutput({
      stdout: versionResult.stdout,
      label: "npm 包全局命令验证",
      commandHint: "version"
    });

    const doctorRoot = path.join(installRoot, "doctor");
    const initResult = runCommand(specnfcCommand.command, [...specnfcCommand.baseArgs, "init", "--cwd", doctorRoot, "--json"], installRoot, "npm 包 doctor 预初始化失败", specnfcCommand.env);
    const initJson = parseJsonCommandOutput({
      stdout: initResult.stdout,
      label: "npm 包 doctor 预初始化",
      commandHint: "init"
    });
    const doctorResult = runCommand(specnfcCommand.command, [...specnfcCommand.baseArgs, "doctor", "--cwd", doctorRoot, "--json"], installRoot, "npm 包 doctor 验证失败", specnfcCommand.env);
    const doctorJson = parseJsonCommandOutput({
      stdout: doctorResult.stdout,
      label: "npm 包 doctor 验证",
      commandHint: "doctor"
    });

    assertVerificationJson({ type: "npm 包", label: "全局命令验证", commandHint: "version", payload: versionJson });
    assertVerificationJson({ type: "npm 包", label: "doctor 预初始化", commandHint: "init", payload: initJson });
    assertVerificationJson({ type: "npm 包", label: "doctor 验证", commandHint: "doctor", payload: doctorJson });
    assertInstalledVersion({ type: "npm 包", expectedVersion, actualVersion: versionJson.data?.specnfcVersion });
    assertDoctorInitialized({ type: "npm 包", doctorJson });

    let demoVerification = null;
    let releaseRegressionVerification = null;
    let fullTestVerification = null;
    if (releaseMode === "strict") {
      const demoRoot = path.join(installRoot, "demo");
      const demoResult = runCommand(specnfcCommand.command, [...specnfcCommand.baseArgs, "demo", "--cwd", demoRoot, "--json"], installRoot, "npm 包 demo 验证失败", specnfcCommand.env);
      const demoJson = parseJsonCommandOutput({
        stdout: demoResult.stdout,
        label: "npm 包 demo 验证",
        commandHint: "demo"
      });
      assertVerificationJson({ type: "npm 包", label: "demo 验证", commandHint: "demo", payload: demoJson });
      demoVerification = {
        profile: demoJson.data?.profile || null
      };

      const releaseRegressionResult = runCommand("npm", ["run", "test:release"], PROJECT_ROOT, "发布回归测试失败");
      releaseRegressionVerification = {
        ok: true,
        command: "npm run test:release",
        summary: tail(releaseRegressionResult.stdout || releaseRegressionResult.stderr)
      };

      if (options.fullTest) {
        const testResult = runCommand("npm", ["test"], PROJECT_ROOT, "全量测试失败");
        fullTestVerification = {
          ok: true,
          command: "npm test",
          summary: tail(testResult.stdout || testResult.stderr)
        };
      }
    }

    return {
      packageArtifact: path.basename(packageArtifactPath),
      summary: {
        installed: true,
        smokePassed: true,
        demoPassed: releaseMode === "strict",
        releaseRegressionPassed: releaseMode === "strict",
        fullTestPassed: options.fullTest
      },
      smokeVerification: {
        version: versionJson.data?.specnfcVersion || null,
        doctorInitialized: doctorJson.data?.initialized || false
      },
      demoVerification,
      releaseRegressionVerification,
      fullTestVerification
    };
  } finally {
    rmSync(installRoot, { recursive: true, force: true });
  }
}

function assertVerificationJson({ type, label, commandHint, payload }) {
  if (payload?.ok === true) {
    return;
  }

  const error = new Error(`${type} ${label}返回失败结果`);
  error.code = "COMMAND_FAILED";
  error.details = `${commandHint}: ${JSON.stringify(payload ?? null)}`;
  throw error;
}

function assertInstalledVersion({ type, expectedVersion, actualVersion }) {
  if (actualVersion === expectedVersion) {
    return;
  }

  const error = new Error(`${type} 全局命令版本校验失败`);
  error.code = "COMMAND_FAILED";
  error.details = `version: expected=${expectedVersion} actual=${actualVersion || "unknown"}`;
  throw error;
}

function assertDoctorInitialized({ type, doctorJson }) {
  if (doctorJson?.data?.initialized === true) {
    return;
  }

  const error = new Error(`${type} doctor 验证未得到已初始化仓`);
  error.code = "COMMAND_FAILED";
  error.details = `doctor: ${JSON.stringify(doctorJson ?? null)}`;
  throw error;
}

function getInstalledSpecnfcCommand(prefixRoot) {
  const pathEntries = process.env.SPECNFC_RELEASE_ALLOW_PATH_OVERRIDE === "1"
    ? [process.env.PATH || "", prefixRoot, path.join(prefixRoot, "bin")]
    : [prefixRoot, path.join(prefixRoot, "bin"), process.env.PATH || ""];
  if (process.platform === "win32") {
    return {
      command: "specnfc.cmd",
      baseArgs: [],
      env: {
        ...process.env,
        PATH: pathEntries.join(path.delimiter)
      }
    };
  }

  return {
    command: "specnfc",
    baseArgs: [],
    env: {
      ...process.env,
      PATH: pathEntries.join(path.delimiter)
    }
  };
}

function parseJsonCommandOutput({ stdout, label, commandHint }) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const parseError = new Error(`${label}输出不是合法 JSON`);
    parseError.code = "COMMAND_FAILED";
    parseError.details = `${commandHint}: ${error instanceof Error ? error.message : String(error)}\n${tail(stdout)}`.trim();
    throw parseError;
  }
}

function runCommand(command, args, cwd, errorMessage, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.error || result.status !== 0) {
    const error = new Error(errorMessage);
    error.code = "COMMAND_FAILED";
    error.details = result.error ? String(result.error.message || result.error) : tail(result.stderr || result.stdout);
    throw error;
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function toRelative(targetPath) {
  return path.relative(PROJECT_ROOT, targetPath).split(path.sep).join("/");
}

function finishSuccess(data) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, data }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`发布版本：${data.version}\n`);
  process.stdout.write(`发布模式：${data.releaseMode}\n`);
  process.stdout.write(`校验级别：${data.verificationLevel}\n`);
  process.stdout.write(`分发方式：${data.distribution}\n`);
  process.stdout.write(`发布目录：${data.releaseDir}\n`);
  if (data.releasePreflight?.status === "skipped") {
    process.stdout.write("仓级门禁：未初始化仓，已跳过协议门禁检查\n");
  } else if (data.releasePreflight?.status === "passed") {
    process.stdout.write("仓级门禁：通过\n");
  }
  if (data.dryRun) {
    process.stdout.write("模式：dry-run\n");
  } else {
    process.stdout.write(`npm 包：${data.packageArtifact}\n`);
    process.stdout.write("npm 安装验证：通过\n");
    process.stdout.write(`正式安装口径：npm install -g spec-nfc@${data.version}\n`);
    process.stdout.write("发布后确认：npm view spec-nfc version\n");
  }
}

function finishError(code, message, details = "") {
  const payload = {
    ok: false,
    error: {
      code,
      message,
      details
    }
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stderr.write(`发布失败：${message}\n`);
    if (details) {
      process.stderr.write(`${details}\n`);
    }
  }

  process.exit(1);
}

function tail(text) {
  return String(text || "").trim().split("\n").slice(-20).join("\n");
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function normalizeNpmPackName(packageName) {
  return String(packageName || "")
    .trim()
    .replace(/^@/, "")
    .replace(/\//g, "-");
}

async function evaluateReleasePreflight(repoRoot) {
  const report = await inspectRepository(repoRoot).catch(() => null);

  if (!report || !report.initialized) {
    return {
      status: "skipped",
      initialized: false,
      summary: "当前仓未初始化，跳过仓级协议门禁检查。",
      blockingIssues: [],
      releaseGateIssues: [],
      recommendedActions: [],
      releaseDecisionGate: {
        status: "skipped",
        matchedDecision: null,
        blockingIssues: [],
        recommendedActions: []
      }
    };
  }

  const releaseDecisionGate = await evaluateReleaseDecisionGate({
    repoRoot,
    releaseTag
  });
  const blockingIssues = [
    ...(report.compliance?.blockingIssues || []),
    ...(releaseDecisionGate.blockingIssues || [])
  ];
  const releaseGateIssues = (report.compliance?.advisoryIssues || []).filter(
    (item) =>
      item === "PROJECTION_DRIFT" ||
      item.startsWith("SKILL_PACK_") ||
      item.startsWith("PROJECT_INDEX_") ||
      item.startsWith("PROJECT_DOC_")
  );
  const status = blockingIssues.length || releaseGateIssues.length ? "blocked" : "passed";

  return {
    status,
    initialized: true,
    summary:
      status === "blocked"
        ? "当前仓存在未闭合的协议阻断项，需先修复后再执行发布。"
        : "当前仓已通过发布前协议门禁检查。",
    blockingIssues,
    releaseGateIssues,
    recommendedActions: unique([...(report.compliance?.recommendedActions || []), ...(releaseDecisionGate.recommendedActions || [])]),
    waivers: report.compliance?.waivers || null,
    releaseDecisionGate
  };
}

async function evaluateReleaseDecisionGate({ repoRoot, releaseTag }) {
  const changeReport = await inspectChanges({ repoRoot });
  const integrationReport = await inspectIntegrations({ repoRoot });
  const hasWorkObjects = (changeReport.changes?.length || 0) > 0 || (integrationReport.integrations?.length || 0) > 0;

  if (!hasWorkObjects) {
    return {
      status: "not_required",
      matchedDecision: null,
      blockingIssues: [],
      recommendedActions: []
    };
  }

  const decisionsRoot = path.join(repoRoot, ".specnfc/governance/release-decisions");
  const decisionInventory = readReleaseDecisionRecords(decisionsRoot, repoRoot);
  const decision = decisionInventory.records.find((item) => item?.releaseTag === releaseTag) || null;
  const invalidDecision = decisionInventory.invalidRecords.find((item) => item.releaseTag === releaseTag) || null;

  if (invalidDecision) {
    return {
      status: "blocked",
      matchedDecision: null,
      blockingIssues: [`RELEASE_DECISION_INVALID:${releaseTag}:${invalidDecision.file}`],
      recommendedActions: [
        `修复损坏的发布决策文件：${invalidDecision.file}`,
        `修复后重新执行 node ./scripts/release.mjs --version ${version} --dry-run --json`
      ]
    };
  }

  if (!decision) {
    return {
      status: "blocked",
      matchedDecision: null,
      blockingIssues: [`RELEASE_DECISION_MISSING:${releaseTag}`],
      recommendedActions: [
        `补充 .specnfc/governance/release-decisions/${releaseTag}.json`,
        "在发布决策中明确 changeRefs / integrationRefs / verificationRecordRefs"
      ]
    };
  }

  const blockingIssues = [];
  const changeMap = new Map((changeReport.changes || []).map((item) => [item.id, item]));
  const integrationMap = new Map((integrationReport.integrations || []).map((item) => [item.id, item]));
  const verificationRecordIds = new Set();
  const waiverIds = readValidWaiverIds(path.join(repoRoot, ".specnfc/governance/waivers"));

  if (decision.decision !== "approved") {
    blockingIssues.push(`RELEASE_DECISION_NOT_APPROVED:${releaseTag}:${decision.decision || "unknown"}`);
  }

  for (const changeRef of normalizeStringList(decision.changeRefs)) {
    const change = changeMap.get(changeRef);
    if (!change) {
      blockingIssues.push(`RELEASE_CHANGE_MISSING:${changeRef}`);
      continue;
    }

    const governance = await inspectGovernanceTarget({
      repoRoot,
      scope: "change",
      targetId: changeRef
    });
    for (const verificationRecord of governance.verificationRecords || []) {
      verificationRecordIds.add(verificationRecord.recordId);
    }

    if (!["handoff", "archived"].includes(change.stage)) {
      blockingIssues.push(`RELEASE_CHANGE_NOT_READY:${changeRef}:${change.stage}`);
    }
  }

  for (const integrationRef of normalizeStringList(decision.integrationRefs)) {
    const integration = integrationMap.get(integrationRef);
    if (!integration) {
      blockingIssues.push(`RELEASE_INTEGRATION_MISSING:${integrationRef}`);
      continue;
    }

    const governance = await inspectGovernanceTarget({
      repoRoot,
      scope: "integration",
      targetId: integrationRef
    });
    for (const verificationRecord of governance.verificationRecords || []) {
      verificationRecordIds.add(verificationRecord.recordId);
    }

    if (integration.status !== "done") {
      blockingIssues.push(`RELEASE_INTEGRATION_NOT_READY:${integrationRef}:${integration.status}`);
    }
  }

  for (const verificationRecordRef of normalizeStringList(decision.verificationRecordRefs)) {
    if (!verificationRecordIds.has(verificationRecordRef)) {
      blockingIssues.push(`RELEASE_DECISION_VERIFICATION_REF_MISSING:${verificationRecordRef}`);
    }
  }

  for (const waiverRef of normalizeStringList(decision.waiverRefs)) {
    if (!waiverIds.has(waiverRef)) {
      blockingIssues.push(`RELEASE_DECISION_WAIVER_REF_MISSING:${waiverRef}`);
    }
  }

  return {
    status: blockingIssues.length ? "blocked" : "passed",
    matchedDecision: {
      recordId: decision.recordId || null,
      releaseTag: decision.releaseTag || releaseTag,
      changeRefs: normalizeStringList(decision.changeRefs),
      integrationRefs: normalizeStringList(decision.integrationRefs),
      verificationRecordRefs: normalizeStringList(decision.verificationRecordRefs),
      waiverRefs: normalizeStringList(decision.waiverRefs)
    },
    blockingIssues,
    recommendedActions: blockingIssues.length
      ? [
          "修复发布决策引用的 change / integration 阶段状态",
          `重新执行 node ./scripts/release.mjs --version ${version} --dry-run --json`
        ]
      : []
  };
}

function readReleaseDecisionRecords(decisionsRoot, repoRoot = PROJECT_ROOT) {
  if (!existsSync(decisionsRoot)) {
    return {
      records: [],
      invalidRecords: []
    };
  }

  return readdirSync(decisionsRoot)
    .filter((item) => item.endsWith(".json"))
    .sort()
    .reduce(
      (acc, fileName) => {
        const filePath = path.join(decisionsRoot, fileName);
        const releaseTag = fileName.replace(/\.json$/, "");
        try {
          const payload = JSON.parse(readFileSync(filePath, "utf8"));
          acc.records.push(payload);
        } catch {
          acc.invalidRecords.push({
            file: path.relative(repoRoot, filePath).split(path.sep).join("/"),
            releaseTag
          });
        }
        return acc;
      },
      {
        records: [],
        invalidRecords: []
      }
    );
}

function readValidWaiverIds(waiverRoot) {
  if (!existsSync(waiverRoot)) {
    return new Set();
  }

  const ids = [];
  for (const entry of readdirSync(waiverRoot).filter((item) => item.endsWith(".json")).sort()) {
    try {
      const payload = JSON.parse(readFileSync(path.join(waiverRoot, entry), "utf8"));
      const waiverId = String(payload?.waiverId || "").trim();
      if (waiverId) {
        ids.push(waiverId);
      }
    } catch {
      // ignore invalid waiver files here; repo-level compliance gate already reports them
    }
  }

  return new Set(ids);
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}
