import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertDesignSchemaMatches, loadDesignSchemas } from "./helpers/output-contracts.mjs";

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI_PATH = path.join(PROJECT_ROOT, "bin/specnfc.mjs");
const BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "scripts/bootstrap.mjs");
const PACKAGE_VERSION = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")).version;

test("init 默认生成 core 骨架", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-core-"));

  try {
    const result = runCli(["init", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.deepEqual(json.data.installedModules, ["core"]);
    assert.equal(json.data.nextStep.currentPhase, "clarify");
    assert.equal(json.data.nextStep.governanceMode, "guided");
    assert.equal(json.data.nextStep.writebackRequired, false);
    assert.equal(typeof json.data.nextStep.updatedAt, "string");

    const config = JSON.parse(await readFile(path.join(cwd, ".specnfc/config.json"), "utf8"));
    assert.equal(config.modules.core.enabled, true);
    assert.equal(config.modules.context.enabled, false);

    const agents = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    const claude = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");
    const trae = await readFile(path.join(cwd, ".trae/rules/project_rules.md"), "utf8");
    const opencode = JSON.parse(await readFile(path.join(cwd, "opencode.json"), "utf8"));

    assert.ok(agents.includes("AI 执行前必须先读"));
    assert.ok(agents.includes("## 项目记忆索引"));
    assert.ok(agents.includes("`specs/changes/<change-id>/meta.json`"));
    assert.ok(agents.includes("`.specnfc/README.md`"));
    assert.ok(agents.includes("`.specnfc/runtime/active-rules.json`"));
    assert.ok(agents.includes("clarify → design → plan → execute → verify → accept → archive"));
    assert.ok(agents.includes("`specs/project/summary.md`"));
    assert.ok(agents.includes("`specnfc status --json`"));
    assert.ok(!agents.includes("`.specnfc/context/`"));
    assert.ok(claude.includes("@AGENTS.md"));
    assert.ok(claude.includes("项目记忆索引如下"));
    assert.ok(claude.includes("`specs/changes/<change-id>/01-需求与方案.md`"));
    assert.ok(claude.includes("`.specnfc/README.md`"));
    assert.ok(claude.includes("`.specnfc/runtime/active-rules.json`"));
    assert.ok(claude.includes("clarify → design → plan → execute → verify → accept → archive"));
    assert.ok(trae.includes("## 项目记忆索引"));
    assert.ok(trae.includes("change 需求与方案"));
    assert.ok(trae.includes("specs/changes/<change-id>/"));
    assert.ok(trae.includes("clarify → design → plan → execute → verify → accept → archive"));
    assert.ok(trae.includes("specnfc status --json"));
    assert.ok(Array.isArray(opencode.instructions));
    assert.ok(opencode.instructions.includes(".specnfc/README.md"));
    assert.ok(opencode.instructions.includes(".specnfc/runtime/active-rules.json"));
    assert.ok(!opencode.instructions.includes(".specnfc/context/**/*.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("init 支持同时安装 context execution governance", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-full-"));

  try {
    const result = runCli(["init", "--cwd", cwd, "--with", "context,execution,governance", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.deepEqual(json.data.installedModules, ["core", "context", "execution", "governance"]);

    const config = JSON.parse(await readFile(path.join(cwd, ".specnfc/config.json"), "utf8"));
    assert.equal(config.modules.context.enabled, true);
    assert.equal(config.modules.execution.enabled, true);
    assert.equal(config.modules.governance.enabled, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("init --profile enterprise 可以生成企业基线模块", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-enterprise-"));

  try {
    const result = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.profile, "enterprise");
    assert.equal(json.data.protocolAdopted, true);
    assert.equal(json.data.repoContract, ".specnfc/contract/repo.json");
    assert.equal(json.data.skillPack.id, "specnfc-zh-cn-default");
    assert.equal(json.data.nfcRuntimeRoot, ".nfc");
    assert.equal(json.data.nextStep.currentPhase, "clarify");
    assert.equal(json.data.nextStep.governanceMode, "guided");
    assert.equal(json.data.nextStep.writebackRequired, false);
    assert.equal(json.data.nextStep.step, "status_entry");
    assert.equal(json.data.nextStep.primaryAction, "specnfc status");
    assert.equal(json.data.nextStep.primaryDoc, ".specnfc/execution/next-step.json");
    assert.equal(json.data.nextStep.stepAware, true);
    assert.ok(json.data.nextStep.recommendedNext.some((item) => item.value === "specnfc status"));
    assert.equal(json.data.nextStepProtocolReady, true);
    assert.deepEqual(json.data.installedModules, [
      "core",
      "context",
      "execution",
      "governance",
      "design-api",
      "design-db",
      "quality",
      "delivery",
      "integration-contract"
    ]);

    const config = JSON.parse(await readFile(path.join(cwd, ".specnfc/config.json"), "utf8"));
    assert.equal(config.repository.profile, "enterprise");
    assert.equal(config.modules["design-db"].enabled, true);
    assert.equal(config.modules.quality.enabled, true);

    await readFile(path.join(cwd, ".specnfc/context/README.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/context/AGENT.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/execution/README.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/execution/AGENT.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/governance/README.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/governance/AGENT.md"), "utf8");
    const personalSkills = await readFile(path.join(cwd, ".specnfc/governance/personal-skills.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/design/api/AGENT.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/design/db/AGENT.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/quality/README.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/quality/AGENT.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/delivery/README.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/delivery/AGENT.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/delivery/branch-policy.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/delivery/commit-policy.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/delivery/push-policy.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/delivery/delivery-checklist.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/delivery/commit-template.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/integration-contract/README.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/integration-contract/AGENT.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/integration-contract/template.md"), "utf8");
    await readFile(path.join(cwd, ".specnfc/integration-contract/status-flow.md"), "utf8");
    const schemaMap = await loadDesignSchemas(
      [
        "add-output.schema.json",
        "bootstrap-output.schema.json",
        "error-output.schema.json",
        "init-output.schema.json",
        "version-output.schema.json",
        "explain-output.schema.json",
        "demo-output.schema.json",
        "upgrade-output.schema.json",
        "release-output.schema.json",
        "status-output.schema.json",
        "doctor-output.schema.json"
      ],
      { root: cwd }
    );
    const addOutputSchema = schemaMap["add-output.schema.json"];
    const bootstrapOutputSchema = schemaMap["bootstrap-output.schema.json"];
    const errorOutputSchema = schemaMap["error-output.schema.json"];
    const initOutputSchema = schemaMap["init-output.schema.json"];
    const versionOutputSchema = schemaMap["version-output.schema.json"];
    const explainOutputSchema = schemaMap["explain-output.schema.json"];
    const demoOutputSchema = schemaMap["demo-output.schema.json"];
    const upgradeOutputSchema = schemaMap["upgrade-output.schema.json"];
    const releaseOutputSchema = schemaMap["release-output.schema.json"];
    const statusOutputSchema = schemaMap["status-output.schema.json"];
    const doctorOutputSchema = schemaMap["doctor-output.schema.json"];
    const repoContract = JSON.parse(await readFile(path.join(cwd, ".specnfc/contract/repo.json"), "utf8"));
    const teamContractRef = JSON.parse(await readFile(path.join(cwd, ".specnfc/contract/team-contract.ref.json"), "utf8"));
    const projectRef = JSON.parse(await readFile(path.join(cwd, ".specnfc/contract/project.ref.json"), "utf8"));
    const nextStep = JSON.parse(await readFile(path.join(cwd, ".specnfc/execution/next-step.json"), "utf8"));
    const nfcRuntime = JSON.parse(await readFile(path.join(cwd, ".nfc/runtime.json"), "utf8"));
    const skillPackManifest = JSON.parse(await readFile(path.join(cwd, ".specnfc/skill-packs/active/manifest.json"), "utf8"));
    const teamPolicyRegistry = JSON.parse(await readFile(path.join(cwd, ".specnfc/governance/registries/team-policy-registry.json"), "utf8"));
    const projectRepoRegistry = JSON.parse(await readFile(path.join(cwd, ".specnfc/governance/registries/project-repo-registry.json"), "utf8"));
    const clarifySkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/workflow/clarify.md"), "utf8");
    const designSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/workflow/design.md"), "utf8");
    const debuggingSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/workflow/systematic-debugging.md"), "utf8");
    const reviewSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/workflow/review.md"), "utf8");
    const releaseHandoffSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/workflow/release-handoff.md"), "utf8");
    const nextStepSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/support/next-step.md"), "utf8");
    const regressionFirstSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/support/regression-first.md"), "utf8");
    const requestReviewSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/support/request-review.md"), "utf8");
    const verifyBeforeCompleteSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/support/verify-before-complete.md"), "utf8");
    const rolePromptCatalog = await readFile(path.join(cwd, ".specnfc/skill-packs/active/prompts/role.md"), "utf8");
    const reviewGateSkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/governance/review-gate.md"), "utf8");
    const activeWritebackPlaybook = await readFile(path.join(cwd, ".specnfc/skill-packs/active/playbooks/writeback.md"), "utf8");
    const agents = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    const claude = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");
    const trae = await readFile(path.join(cwd, ".trae/rules/project_rules.md"), "utf8");
    const opencode = JSON.parse(await readFile(path.join(cwd, "opencode.json"), "utf8"));
    const contextReadme = await readFile(path.join(cwd, ".specnfc/context/README.md"), "utf8");
    const governanceReadme = await readFile(path.join(cwd, ".specnfc/governance/README.md"), "utf8");
    const specsReadme = await readFile(path.join(cwd, "specs/README.md"), "utf8");
    const integrationReadme = await readFile(path.join(cwd, ".specnfc/integration-contract/README.md"), "utf8");

    assert.ok(personalSkills.includes("个人 Skills 兼容规则"));
    assert.ok(agents.includes("## 个人 Skills 兼容规则"));
    assert.ok(agents.includes("`.specnfc/context/system.md`"));
    assert.ok(agents.includes("`.specnfc/governance/decision-gates.md`"));
    assert.ok(agents.includes("`specnfc change check <change-id>`"));
    assert.ok(agents.includes("`specnfc integration check <integration-id>`"));
    assert.ok(claude.includes("## 个人 Skills 兼容规则"));
    assert.ok(claude.includes("`.specnfc/context/architecture.md`"));
    assert.ok(claude.includes("specnfc status --json"));
    assert.ok(trae.includes("## 个人 Skills 兼容规则"));
    assert.ok(trae.includes("`.specnfc/governance/security-boundaries.md`"));
    assert.ok(trae.includes("specnfc change check <change-id>"));
    assert.ok(contextReadme.includes("## 作为项目长期记忆的职责"));
    assert.ok(governanceReadme.includes("## 作为项目长期记忆的职责"));
    assert.ok(specsReadme.includes("## 作为过程记忆的职责"));
    assert.ok(integrationReadme.includes("## 作为过程记忆的职责"));
    assert.ok(opencode.instructions.includes(".specnfc/integration-contract/**/*.md"));
    assert.ok(opencode.instructions.includes(".specnfc/runtime/active-rules.json"));
    assert.ok(opencode.instructions.includes("specs/integrations/**/*.md"));
    assert.equal(bootstrapOutputSchema.title, "specnfc bootstrap script --json output");
    assert.equal(addOutputSchema.title, "specnfc add --json output");
    assert.equal(errorOutputSchema.title, "specnfc error --json output");
    assert.equal(initOutputSchema.title, "specnfc init --json output");
    assert.equal(versionOutputSchema.title, "specnfc version --json output");
    assert.equal(explainOutputSchema.title, "specnfc explain --json output");
    assert.equal(demoOutputSchema.title, "specnfc demo --json output");
    assert.equal(upgradeOutputSchema.title, "specnfc upgrade --json output");
    assert.equal(releaseOutputSchema.title, "specnfc release script --json output");
    assert.equal(statusOutputSchema.title, "specnfc status --json output");
    assert.equal(doctorOutputSchema.title, "specnfc doctor --json output");
    assert.equal(repoContract.governanceMode, "guided");
    assert.equal(repoContract.activeSkillPack.id, "specnfc-zh-cn-default");
    assert.ok(skillPackManifest.workflowSkills.includes("systematic-debugging"));
    assert.ok(skillPackManifest.workflowSkills.includes("review"));
    assert.ok(skillPackManifest.workflowSkills.includes("release-handoff"));
    assert.ok(Array.isArray(skillPackManifest.workflowSkillCatalog));
    assert.ok(Array.isArray(skillPackManifest.supportSkillCatalog));
    assert.ok(Array.isArray(skillPackManifest.governanceSkillCatalog));
    assert.ok(Array.isArray(skillPackManifest.promptCatalogEntries));
    assert.ok(Array.isArray(skillPackManifest.playbooks));
    assert.ok(skillPackManifest.phaseCoverage.execute.includes("systematic-debugging"));
    assert.ok(skillPackManifest.phaseCoverage.verify.includes("review"));
    assert.ok(skillPackManifest.phaseCoverage.accept.includes("release-handoff"));
    assert.equal(skillPackManifest.workflowSkillCatalog.find((item) => item.slug === "review")?.gate.requiredEvidence[0], "specs/changes/<change-id>/evidence/reviews/<review-id>.json");
    assert.ok(skillPackManifest.governanceSkills.includes("review-gate"));
    assert.ok(skillPackManifest.governanceSkills.includes("verification-gate"));
    assert.equal(skillPackManifest.governanceSkillCatalog.find((item) => item.slug === "approval-gate")?.trustTier, "governed");
    assert.equal(skillPackManifest.playbooks.find((item) => item.slug === "writeback")?.sourcePath, "playbooks/writeback.md");
    assert.equal(skillPackManifest.externalSkillPolicy?.importRoot, ".nfc/imports");
    assert.equal(skillPackManifest.capabilityParityMatrix, "capability-parity-matrix.md");
    assert.ok(skillPackManifest.supportSkills.includes("regression-first"));
    assert.ok(skillPackManifest.supportSkills.includes("request-review"));
    assert.ok(skillPackManifest.supportSkills.includes("verify-before-complete"));
    assert.equal(skillPackManifest.supportSkillCatalog.find((item) => item.slug === "regression-first")?.category, "discipline");
    assert.equal(skillPackManifest.supportSkillCatalog.find((item) => item.slug === "verify-before-complete")?.recommendedCli, "specnfc doctor");
    assert.equal(teamContractRef.registryRefs.policy, ".specnfc/governance/registries/team-policy-registry.json");
    assert.equal(projectRef.registryRefs.repo, ".specnfc/governance/registries/project-repo-registry.json");
    assert.equal(teamPolicyRegistry.registryType, "team-policy");
    assert.equal(projectRepoRegistry.registryType, "project-repo");
    const teamSkillPackRegistry = JSON.parse(await readFile(path.join(cwd, ".specnfc/governance/registries/team-skill-pack-registry.json"), "utf8"));
    assert.equal(teamSkillPackRegistry.builtInSourceRoot, "skill-packs/specnfc-zh-cn-default");
    assert.equal(teamSkillPackRegistry.externalImportRoot, ".nfc/imports");
    assert.equal(teamSkillPackRegistry.runtimeSkillAccess.mode, "source-only");
    assert.equal(teamSkillPackRegistry.runtimeSkillAccess.sourceRoot, ".specnfc/skill-packs/active");
    assert.equal(teamSkillPackRegistry.runtimeSkillAccess.runtimeMirrorRoot, null);
    assert.equal(nextStep.currentPhase, "clarify");
    assert.equal(nfcRuntime.root, ".nfc");
    assert.equal(nfcRuntime.skillAccess.mode, "source-only");
    assert.equal(nfcRuntime.skillAccess.sourceRoot, ".specnfc/skill-packs/active");
    assert.equal(nfcRuntime.skillAccess.runtimeMirrorRoot, null);
    assert.ok(clarifySkill.includes("# 工作流技能：需求澄清（clarify）"));
    assert.ok(clarifySkill.includes("## 全局阶段顺序"));
    assert.ok(clarifySkill.includes("clarify → design → plan → execute → verify → accept → archive"));
    assert.ok(clarifySkill.includes("## 阶段门禁"));
    assert.ok(clarifySkill.includes("## writeback 规则"));
    assert.ok(clarifySkill.includes("## 必须写入的正式文档"));
    assert.ok(clarifySkill.includes("## 工作方式：访谈式澄清协议"));
    assert.ok(clarifySkill.includes("Readiness Gates"));
    assert.ok(clarifySkill.includes("压力追问"));
    assert.ok(designSkill.includes("# 工作流技能：方案设计（design）"));
    assert.ok(designSkill.includes("## 工作方式：轻量 ralplan 化设计协议"));
    assert.ok(designSkill.includes("Decision Drivers"));
    assert.ok(designSkill.includes("当前推荐方案 / 决策边界"));
    assert.ok(debuggingSkill.includes("# 工作流技能：系统化调试（systematic-debugging）"));
    assert.ok(debuggingSkill.includes("失败日志 / 测试输出 / 最小复现证据"));
    assert.ok(reviewSkill.includes("# 工作流技能：评审复核（review）"));
    assert.ok(reviewSkill.includes("specs/changes/<change-id>/evidence/reviews/<review-id>.json"));
    assert.ok(releaseHandoffSkill.includes("# 工作流技能：发布交接（release-handoff）"));
    assert.ok(releaseHandoffSkill.includes("specs/changes/<change-id>/commit-message.md"));
    assert.ok(nextStepSkill.includes("# 辅助技能：下一步推荐（next-step）"));
    assert.ok(regressionFirstSkill.includes("# 辅助技能：回归优先（regression-first）"));
    assert.ok(regressionFirstSkill.includes("## 触发条件"));
    assert.ok(regressionFirstSkill.includes("在 strict / locked 模式下，行为纪律类技能未完成时不得跳过进入下游阶段。"));
    assert.ok(requestReviewSkill.includes("# 辅助技能：请求代码评审（request-review）"));
    assert.ok(requestReviewSkill.includes("specs/changes/<change-id>/evidence/reviews/<review-id>.json"));
    assert.ok(verifyBeforeCompleteSkill.includes("# 辅助技能：完成前验证（verify-before-complete）"));
    assert.ok(verifyBeforeCompleteSkill.includes("specs/changes/<change-id>/delivery-checklist.md"));
    assert.ok(rolePromptCatalog.includes("# 角色 Prompt 目录"));
    assert.ok(rolePromptCatalog.includes("调试者：聚焦复现、根因、失败路径和修复验证。"));
    assert.ok(reviewGateSkill.includes("# 治理技能：评审门禁（review-gate）"));
    assert.ok(activeWritebackPlaybook.includes("# 运行时 Playbook：写回编排"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("add 可以追加 design-api 模块", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-add-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    const result = runCli(["add", "design-api", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.deepEqual(json.data.addedModules, ["design-api"]);

    const config = JSON.parse(await readFile(path.join(cwd, ".specnfc/config.json"), "utf8"));
    assert.equal(config.modules["design-api"].enabled, true);

    const agents = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    const opencode = JSON.parse(await readFile(path.join(cwd, "opencode.json"), "utf8"));

    assert.ok(agents.includes("`.specnfc/design/api/`"));
    assert.ok(opencode.instructions.includes(".specnfc/design/api/**/*.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("add 可以追加 integration-contract 模块", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-add-integration-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    const result = runCli(["add", "integration-contract", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.deepEqual(json.data.addedModules, ["integration-contract"]);

    const config = JSON.parse(await readFile(path.join(cwd, ".specnfc/config.json"), "utf8"));
    assert.equal(config.modules["integration-contract"].enabled, true);

    const agents = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    const opencode = JSON.parse(await readFile(path.join(cwd, "opencode.json"), "utf8"));

    assert.ok(agents.includes("`.specnfc/integration-contract/`"));
    assert.ok(opencode.instructions.includes(".specnfc/integration-contract/**/*.md"));
    assert.ok(opencode.instructions.includes("specs/integrations/**/*.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 能发现配置漂移", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-"));

  try {
    runCli(["init", "--cwd", cwd, "--with", "governance", "--json"]);
    await rm(path.join(cwd, ".specnfc/governance"), { recursive: true, force: true });

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.risks[0].code, "DRIFT_DETECTED");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("高价值 CLI JSON 输出实例符合 schema", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-cli-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    await assertDesignSchemaMatches("status-output.schema.json", statusJson, { label: "status" });
    assert.equal(statusJson.data.contractHealthSummary.controlPlaneStatus, "完整");
    assert.equal(statusJson.data.contractHealthSummary.complianceLevel, "提示");
    assert.equal(statusJson.data.contractHealthSummary.currentPhase, "需求澄清");

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    await assertDesignSchemaMatches("doctor-output.schema.json", doctorJson, { label: "doctor" });
    assert.equal(doctorJson.data.contractHealthSummary.controlPlaneStatus, "完整");
    assert.equal(doctorJson.data.contractHealthSummary.complianceLevel, "提示");
    assert.equal(doctorJson.data.contractHealthSummary.currentPhase, "需求澄清");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});


test("doctor 非 JSON 输出会使用中文协议合同摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-human-zh-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const result = runCli(["doctor", "--cwd", cwd]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /协议合同健康摘要/);
    assert.match(result.stdout, /控制面/);
    assert.match(result.stdout, /下一步协议/);
    assert.match(result.stdout, /仓库档位：企业级/);
    assert.ok(!result.stdout.includes("Control Plane"));
    assert.ok(!result.stdout.includes("Compliance"));
    assert.ok(!result.stdout.includes("Next-step Protocol"));
    assert.ok(!result.stdout.includes("Profile："));
    assert.ok(!result.stdout.includes("Active Skill Pack"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("扩展与迁移类 CLI JSON 输出实例符合 schema", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-expansion-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);

    const addResult = runCli(["add", "design-api", "--cwd", cwd, "--json"]);
    assert.equal(addResult.status, 0);
    const addJson = JSON.parse(addResult.stdout);
    await assertDesignSchemaMatches("add-output.schema.json", addJson, { label: "add" });

    const upgradeResult = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(upgradeResult.status, 0);
    const upgradeJson = JSON.parse(upgradeResult.stdout);
    await assertDesignSchemaMatches("upgrade-output.schema.json", upgradeJson, { label: "upgrade" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }

  const demoCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-demo-"));
  try {
    const demoResult = runCli(["demo", "--cwd", demoCwd, "--json"]);
    assert.equal(demoResult.status, 0);
    const demoJson = JSON.parse(demoResult.stdout);
    await assertDesignSchemaMatches("demo-output.schema.json", demoJson, { label: "demo" });
  } finally {
    await rm(demoCwd, { recursive: true, force: true });
  }
});

test("初始化与主工作流 JSON 输出实例符合 schema", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-workflow-"));

  try {
    const initResult = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(initResult.status, 0);
    const initJson = JSON.parse(initResult.stdout);
    await assertDesignSchemaMatches("init-output.schema.json", initJson, { label: "init" });

    const changeCreateResult = runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(changeCreateResult.status, 0);
    const changeCreateJson = JSON.parse(changeCreateResult.stdout);
    await assertDesignSchemaMatches("change-create-output.schema.json", changeCreateJson, { label: "change-create" });

    await fillChangeForExecution(cwd, "risk-device-link");

    const changeCheckResult = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(changeCheckResult.status, 0);
    const changeCheckJson = JSON.parse(changeCheckResult.stdout);
    await assertDesignSchemaMatches("change-check-output.schema.json", changeCheckJson, { label: "change-check" });
    assert.equal(changeCheckJson.data.contractHealthSummary.currentPhase, "需求澄清");
    assert.ok(changeCheckJson.data.contractHealthSummary.blockerCount >= 0);

    const changeStageResult = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "in-progress", "--json"]);
    assert.equal(changeStageResult.status, 0);
    const changeStageJson = JSON.parse(changeStageResult.stdout);
    await assertDesignSchemaMatches("change-stage-output.schema.json", changeStageJson, { label: "change-stage" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }

  const integrationCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-integration-"));
  try {
    runCli(["init", "--cwd", integrationCwd, "--profile", "enterprise", "--json"]);

    const integrationCreateResult = runCli([
      "integration",
      "create",
      "account-risk-api",
      "--cwd",
      integrationCwd,
      "--provider",
      "risk-engine",
      "--consumer",
      "account-service",
      "--changes",
      "risk-score-upgrade",
      "--json"
    ]);
    assert.equal(integrationCreateResult.status, 0);
    const integrationCreateJson = JSON.parse(integrationCreateResult.stdout);
    await assertDesignSchemaMatches("integration-create-output.schema.json", integrationCreateJson, { label: "integration-create" });

    await writeReadyIntegrationFiles(integrationCwd, "account-risk-api");

    const integrationCheckResult = runCli(["integration", "check", "account-risk-api", "--cwd", integrationCwd, "--json"]);
    assert.equal(integrationCheckResult.status, 0);
    const integrationCheckJson = JSON.parse(integrationCheckResult.stdout);
    await assertDesignSchemaMatches("integration-check-output.schema.json", integrationCheckJson, { label: "integration-check" });
    assert.equal(integrationCheckJson.data.contractHealthSummary.currentPhase, "需求澄清");
    assert.ok(integrationCheckJson.data.contractHealthSummary.blockerCount >= 0);

    const integrationStageResult = runCli(["integration", "stage", "account-risk-api", "--cwd", integrationCwd, "--to", "aligned", "--json"]);
    assert.equal(integrationStageResult.status, 0);
    const integrationStageJson = JSON.parse(integrationStageResult.stdout);
    await assertDesignSchemaMatches("integration-stage-output.schema.json", integrationStageJson, { label: "integration-stage" });
  } finally {
    await rm(integrationCwd, { recursive: true, force: true });
  }
});

test("典型 CLI 错误输出实例符合通用 error schema", async () => {
  const invalidInit = runCli(["init", "--profile", "unknown-profile", "--json"]);
  assert.equal(invalidInit.status, 2);
  const invalidInitJson = JSON.parse(invalidInit.stdout);
  assert.equal(invalidInitJson.error.code, "INVALID_ARGS");
  await assertDesignSchemaMatches("error-output.schema.json", invalidInitJson, { label: "init-error" });

  const addCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-add-error-"));
  try {
    runCli(["init", "--cwd", addCwd, "--json"]);
    const addFailure = runCli(["add", "missing-module", "--cwd", addCwd, "--json"]);
    assert.equal(addFailure.status, 1);
    const addFailureJson = JSON.parse(addFailure.stdout);
    assert.equal(addFailureJson.error.code, "MODULE_NOT_FOUND");
    await assertDesignSchemaMatches("error-output.schema.json", addFailureJson, { label: "add-error" });
  } finally {
    await rm(addCwd, { recursive: true, force: true });
  }

  const upgradeCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-upgrade-error-"));
  try {
    const upgradeFailure = runCli(["upgrade", "--cwd", upgradeCwd, "--json"]);
    assert.equal(upgradeFailure.status, 1);
    const upgradeFailureJson = JSON.parse(upgradeFailure.stdout);
    assert.equal(upgradeFailureJson.error.code, "NOT_INITIALIZED");
    await assertDesignSchemaMatches("error-output.schema.json", upgradeFailureJson, { label: "upgrade-error" });
  } finally {
    await rm(upgradeCwd, { recursive: true, force: true });
  }

  const changeCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-change-error-"));
  try {
    runCli(["init", "--cwd", changeCwd, "--json"]);
    const changeFailure = runCli(["change", "stage", "missing-change", "--cwd", changeCwd, "--to", "in-progress", "--json"]);
    assert.equal(changeFailure.status, 2);
    const changeFailureJson = JSON.parse(changeFailure.stdout);
    assert.equal(changeFailureJson.error.code, "CHANGE_NOT_FOUND");
    await assertDesignSchemaMatches("error-output.schema.json", changeFailureJson, { label: "change-error" });
  } finally {
    await rm(changeCwd, { recursive: true, force: true });
  }

  const integrationCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-integration-error-"));
  try {
    runCli(["init", "--cwd", integrationCwd, "--profile", "enterprise", "--json"]);
    const integrationFailure = runCli(["integration", "stage", "missing-integration", "--cwd", integrationCwd, "--to", "aligned", "--json"]);
    assert.equal(integrationFailure.status, 1);
    const integrationFailureJson = JSON.parse(integrationFailure.stdout);
    assert.equal(integrationFailureJson.error.code, "INTEGRATION_NOT_FOUND");
    await assertDesignSchemaMatches("error-output.schema.json", integrationFailureJson, { label: "integration-error" });
  } finally {
    await rm(integrationCwd, { recursive: true, force: true });
  }

  const explainFailure = runCli(["explain", "missing-topic", "--json"]);
  assert.equal(explainFailure.status, 2);
  const explainFailureJson = JSON.parse(explainFailure.stdout);
  assert.equal(explainFailureJson.error.code, "INVALID_ARGS");
  await assertDesignSchemaMatches("error-output.schema.json", explainFailureJson, { label: "explain-error" });
});

test("边界失败场景输出也符合通用 error schema", async () => {
  const pathConflictCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-path-conflict-"));
  try {
    runCli(["init", "--cwd", pathConflictCwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", pathConflictCwd, "--json"]);

    const pathConflict = runCli(["change", "create", "risk-device-link", "--cwd", pathConflictCwd, "--json"]);
    assert.equal(pathConflict.status, 3);
    const pathConflictJson = JSON.parse(pathConflict.stdout);
    assert.equal(pathConflictJson.error.code, "PATH_CONFLICT");
    await assertDesignSchemaMatches("error-output.schema.json", pathConflictJson, { label: "path-conflict-error" });
  } finally {
    await rm(pathConflictCwd, { recursive: true, force: true });
  }

  const preconditionCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-precondition-"));
  try {
    runCli(["init", "--cwd", preconditionCwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", preconditionCwd, "--json"]);

    const preconditionFailure = runCli(["change", "archive", "risk-device-link", "--cwd", preconditionCwd, "--json"]);
    assert.notEqual(preconditionFailure.status, 0);
    const preconditionJson = JSON.parse(preconditionFailure.stdout);
    assert.equal(preconditionJson.error.code, "PRECONDITION_FAILED");
    await assertDesignSchemaMatches("error-output.schema.json", preconditionJson, { label: "precondition-error" });
  } finally {
    await rm(preconditionCwd, { recursive: true, force: true });
  }

  const writeDeniedCwd = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-write-denied-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "specnfc-schema-instance-outside-"));
  try {
    runCli(["init", "--cwd", writeDeniedCwd, "--json"]);
    await rm(path.join(writeDeniedCwd, "specs/changes"), { recursive: true, force: true });
    await symlink(outsideRoot, path.join(writeDeniedCwd, "specs/changes"));

    const writeDenied = runCli(["change", "create", "risk-device-link", "--cwd", writeDeniedCwd, "--json"]);
    assert.equal(writeDenied.status, 3);
    const writeDeniedJson = JSON.parse(writeDenied.stdout);
    assert.equal(writeDeniedJson.error.code, "WRITE_DENIED");
    await assertDesignSchemaMatches("error-output.schema.json", writeDeniedJson, { label: "write-denied-error" });
  } finally {
    await rm(writeDeniedCwd, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("doctor 能发现入口文件缺少个人 Skills 兼容规则", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-skill-policy-"));

  try {
    runCli(["init", "--cwd", cwd, "--with", "governance", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\\n\\n这里故意去掉个人 Skills 兼容规则。\\n",
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.risks.some((item) => item.code === "ENTRY_POLICY_MISSING"));
    assert.equal(json.data.controlPlane.projectionStatus, "drifted");
    assert.equal(json.data.controlPlane.projectionHealth.status, "drifted");
    assert.ok(json.data.controlPlane.projectionHealth.driftCount >= 1);
    assert.ok(json.data.controlPlane.projectionHealth.items.some((item) => item.file === "AGENTS.md" && item.status === "drifted"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 能发现缺失的 design schema 文件", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-missing-design-schema-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await rm(path.join(cwd, ".specnfc/design/status-output.schema.json"), { force: true });

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.controlPlane.status, "partial");
    assert.ok(json.data.controlPlane.missingCount >= 1);
    assert.equal(json.data.controlPlane.checks.design.status, "partial");
    assert.ok(json.data.controlPlane.checks.design.missing.includes(".specnfc/design/status-output.schema.json"));
    assert.ok(json.data.compliance.blockingIssues.includes("CONTROL_PLANE_MISSING:1"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 能发现 opencode 缺失导致的 projection 缺口", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-projection-missing-opencode-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await rm(path.join(cwd, "opencode.json"), { force: true });

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.risks.some((item) => item.code === "OPENCODE_CONFIG_MISSING"));
    assert.equal(json.data.controlPlane.projectionStatus, "drifted");
    assert.ok(json.data.controlPlane.projectionHealth.missingCount >= 1);
    assert.ok(json.data.controlPlane.projectionHealth.items.some((item) => item.file === "opencode.json" && item.status === "missing"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 在 projection drift 时会给出具体修复建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-projection-recommendation-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("AGENTS.md")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("specnfc upgrade")));
    assert.ok(json.next.some((item) => item.includes("AGENTS.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会识别有效 waiver 并把 projection drift 视为已豁免", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-waiver-projection-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, ".specnfc/governance/waivers/projection-drift.json"),
      `${JSON.stringify(
        {
          waiverId: "projection-drift",
          scope: "repository",
          target: "projectionStatus",
          reason: "临时允许入口投影漂移，等待统一重生成",
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

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.controlPlane.projectionStatus, "drifted");
    assert.ok(!json.data.compliance.advisoryIssues.includes("PROJECTION_DRIFT"));
    assert.equal(json.data.compliance.waivers.status, "active");
    assert.equal(json.data.compliance.waivers.validCount, 1);
    assert.equal(json.data.compliance.waivers.expiredCount, 0);
    assert.equal(json.data.compliance.waivers.invalidCount, 0);
    assert.ok(json.data.compliance.waivers.appliedIssueCodes.includes("PROJECTION_DRIFT"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 在 skill-pack drift 时会给出具体修复建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-skill-pack-recommendation-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    const skillPackManifestPath = path.join(cwd, ".specnfc/skill-packs/active/manifest.json");
    const skillPackManifest = JSON.parse(await readFile(skillPackManifestPath, "utf8"));
    skillPackManifest.version = "0.0.0-test";
    await writeFile(skillPackManifestPath, `${JSON.stringify(skillPackManifest, null, 2)}\n`, "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("manifest.json")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("skill-pack 主文档")));
    assert.ok(json.next.some((item) => item.includes("manifest.json")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 在存在过期 waiver 时会给出续期或删除建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-expired-waiver-recommendation-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, ".specnfc/governance/waivers/expired-projection.json"),
      `${JSON.stringify(
        {
          waiverId: "expired-projection",
          scope: "repository",
          target: "projectionStatus",
          reason: "测试过期 waiver 建议",
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

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.compliance.blockingIssues.includes("WAIVER_EXPIRED:1"));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("续期或删除")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes(".specnfc/governance/waivers/")));
    assert.ok(json.next.some((item) => item.includes("续期或删除")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会把无效 waiver 视为 blocking 并汇总到豁免摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-invalid-waiver-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, ".specnfc/governance/waivers/invalid-waiver.json"),
      `${JSON.stringify(
        {
          waiverId: "invalid-waiver",
          scope: "repository",
          reason: "故意缺少 target 用于测试",
          approvedBy: "team-architect",
          createdAt: "2026-04-13T00:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.compliance.complianceLevel, "blocking");
    assert.ok(json.data.compliance.blockingIssues.includes("WAIVER_INVALID:1"));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes(".specnfc/governance/waivers/")));
    assert.equal(json.data.compliance.waivers.status, "attention");
    assert.equal(json.data.compliance.waivers.invalidCount, 1);
    assert.equal(json.data.compliance.waivers.expiredCount, 0);
    assert.equal(json.data.compliance.waivers.validCount, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会把损坏的 waiver JSON 视为 blocking", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-broken-waiver-json-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, ".specnfc/governance/waivers/broken-waiver.json"),
      "{not-json\n",
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.compliance.complianceLevel, "blocking");
    assert.ok(json.data.compliance.blockingIssues.includes("WAIVER_INVALID:1"));
    assert.equal(json.data.compliance.waivers.status, "attention");
    assert.equal(json.data.compliance.waivers.invalidCount, 1);
    assert.equal(json.data.compliance.waivers.validCount, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 能发现配置文件损坏", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-invalid-config-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    await writeFile(path.join(cwd, ".specnfc/config.json"), "{invalid-json", "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.risks[0].code, "INVALID_CONFIG");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在未初始化仓返回 not_initialized", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-empty-"));

  try {
    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.command, "status");
    assert.equal(json.data.status, "not_initialized");
    assert.equal(json.data.repo.initialized, false);
    assert.deepEqual(json.data.changes, []);
    assert.ok(json.data.next.includes("运行 `specnfc init --with context,execution,governance`"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在健康且无活跃 change 时返回 healthy_idle", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-idle-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "healthy_idle");
    assert.equal(json.data.repo.initialized, true);
    assert.equal(json.data.summary.activeChangeCount, 0);
    assert.equal(json.data.summary.activeIntegrationCount, 0);
    assert.equal(json.data.changes.length, 0);
    assert.equal(json.data.repo.activeRules.path, ".specnfc/runtime/active-rules.json");
    assert.equal(json.data.repo.controlPlane.status, "complete");
    assert.equal(json.data.repo.controlPlane.repoContractPath, ".specnfc/contract/repo.json");
    assert.equal(json.data.repo.controlPlane.activeSkillPack, "specnfc-zh-cn-default");
    assert.equal(json.data.repo.controlPlane.nfcRuntimeRoot, ".nfc");
    assert.equal(json.data.repo.controlPlane.skillPackStatus, "synced");
    assert.equal(json.data.repo.controlPlane.runtimeSyncStatus, "clean");
    assert.equal(json.data.repo.compliance.complianceLevel, "advisory");
    assert.equal(json.data.repo.projectIndex.status, "partial");
    assert.equal(json.data.repo.projectIndex.summaryPath, "specs/project/summary.md");
    assert.equal(json.data.repo.projectIndex.readmePath, "specs/project/README.md");
    assert.equal(json.data.repo.projectIndex.advisoryCount, 1);
    assert.ok(json.data.repo.projectIndex.advisories.some((item) => item.code === "PROJECT_SUMMARY_PLACEHOLDER"));
    assert.ok(json.data.repo.projectIndex.summaryContract.placeholderMarkers.length > 0);
    assert.equal(json.data.repo.nextStepProtocol.currentPhase, "clarify");
    assert.equal(json.data.repo.nextStepProtocol.step, "create_change");
    assert.equal(json.data.repo.nextStepProtocol.primaryAction, "specnfc change create <change-id>");
    assert.equal(json.data.repo.nextStepProtocol.primaryDoc, "specs/changes/<change-id>/01-需求与方案.md");
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("project summary 仍是初始化占位或缺少必填章节"));
    assert.ok(json.data.repo.nextStepProtocol.recommendedNext.some((item) => item.value === "specnfc change create <change-id>"));
    assert.ok(json.data.repo.activeRules.enabledModules.includes("core"));
    assert.ok(json.data.repo.activeRules.blockingScopes.includes("change"));
    assert.ok(json.data.repo.activeRules.advisoryScopes.includes("repository"));
    assert.ok(json.data.next.includes("当前先执行 `specnfc change create <change-id>`"));
    assert.ok(json.data.next.some((item) => item.includes("specnfc change check <change-id>")));

    const activeRules = JSON.parse(await readFile(path.join(cwd, ".specnfc/runtime/active-rules.json"), "utf8"));
    const nextStep = JSON.parse(await readFile(path.join(cwd, ".specnfc/execution/next-step.json"), "utf8"));
    const currentExecution = JSON.parse(await readFile(path.join(cwd, ".specnfc/execution/current.json"), "utf8"));
    const repoIndex = JSON.parse(await readFile(path.join(cwd, ".specnfc/indexes/repo-index.json"), "utf8"));
    const projectIndex = JSON.parse(await readFile(path.join(cwd, ".specnfc/indexes/project-index.json"), "utf8"));
    const docIndex = JSON.parse(await readFile(path.join(cwd, ".specnfc/indexes/doc-index.json"), "utf8"));
    const projectSummary = await readFile(path.join(cwd, "specs/project/summary.md"), "utf8");
    assert.equal(activeRules.path, ".specnfc/runtime/active-rules.json");
    assert.equal(activeRules.repository.profile, "enterprise");
    assert.equal(nextStep.currentPhase, "clarify");
    assert.equal(nextStep.writebackRequired, false);
    assert.equal(currentExecution.currentPhase, "clarify");
    assert.equal(repoIndex.counts.activeChanges, 0);
    assert.equal(projectIndex.projectDocs.summary, "specs/project/summary.md");
    assert.ok(projectIndex.projectDocs.readingPath.includes("specs/project/summary.md"));
    assert.ok(projectSummary.includes("## 最近迭代结果"));
    assert.ok(docIndex.repository.includes(".specnfc/execution/next-step.json"));
    assert.ok(docIndex.repository.includes("specs/project/summary.md"));
    assert.equal(docIndex.project.index, ".specnfc/indexes/project-index.json");
    assert.ok(activeRules.enabledModules.includes("integration-contract"));
    assert.ok(activeRules.blockingRules.some((item) => item.scope === "change"));
    assert.ok(activeRules.advisoryRules.some((item) => item.scope === "repository"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});


test("status 非 JSON 输出会使用中文协议合同摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-human-zh-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const result = runCli(["status", "--cwd", cwd]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /协议合同健康摘要/);
    assert.match(result.stdout, /控制面/);
    assert.match(result.stdout, /下一步协议/);
    assert.match(result.stdout, /仓库档位：企业级/);
    assert.ok(!result.stdout.includes("Control Plane"));
    assert.ok(!result.stdout.includes("Compliance"));
    assert.ok(!result.stdout.includes("Next-step Protocol"));
    assert.ok(!result.stdout.includes("Profile："));
    assert.ok(!result.stdout.includes("Active Skill Pack"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration create/check/stage 会生成对接目录并汇总到 status 与 doctor", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-flow-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    let result = runCli([
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
    let json = JSON.parse(result.stdout);
    assert.equal(json.data.integration.id, "account-risk-api");
    assert.equal(json.data.integration.canonicalStage, "clarify");
    assert.equal(json.data.nextStep.currentPhase, "clarify");
    assert.equal(json.data.nextStep.governanceMode, "guided");
    assert.equal(json.data.nextStep.writebackRequired, false);
    assert.equal(json.data.nextStep.projectionDrift, false);
    assert.equal(json.data.nextStep.skillPackDrift, false);
    assert.equal(typeof json.data.nextStep.updatedAt, "string");
    const activeIntegration = JSON.parse(
      await readFile(path.join(cwd, ".specnfc/execution/active-integration.ref.json"), "utf8")
    );
    const integrationIndex = JSON.parse(
      await readFile(path.join(cwd, ".specnfc/indexes/integration-index.json"), "utf8")
    );
    const runtimeLinks = JSON.parse(
      await readFile(path.join(cwd, "specs/integrations/account-risk-api/runtime-links.json"), "utf8")
    );
    assert.equal(activeIntegration.integrationId, "account-risk-api");
    assert.equal(activeIntegration.path, "specs/integrations/account-risk-api");
    assert.ok(integrationIndex.items.some((item) => item.id === "account-risk-api" && item.path === "specs/integrations/account-risk-api"));
    assert.equal(runtimeLinks.scope, "integration");
    assert.equal(runtimeLinks.targetId, "account-risk-api");

    await writeFile(
      path.join(cwd, "specs/integrations/account-risk-api/contract.md"),
      "# 对接契约\n\n## 基本信息\n- 对接标识：`account-risk-api`\n- 提供方：`risk-engine`\n- 消费方：`account-service`\n- 关联 change-id：`risk-score-upgrade`\n\n## 契约摘要\n- 接口 / service 名称：account-risk-api\n- 对接目标：输出风险评分\n- 变更类型：兼容修改\n\n## 调用约定\n| 项 | 内容 |\n|---|---|\n| 输入 | accountId |\n| 输出 | riskScore |\n| 错误码 / 异常 | RISK_TIMEOUT |\n| 超时 | 500ms |\n| 重试 | 1 次 |\n| 幂等 | 是 |\n| 鉴权 | 内网服务鉴权 |\n\n## 责任分工\n- 提供方负责：接口实现\n- 消费方负责：接入调用\n- 联调负责人：integration-lead\n- 最终裁决人：tech-lead\n\n## 依赖顺序\n1. 提供方先出契约\n2. 消费方完成接入\n3. 双方联调验收\n\n## 联调前置条件\n- [x] 条件 1\n- [x] 条件 2\n\n## 验收标准\n- [x] 验收点 1\n- [x] 验收点 2\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, "specs/integrations/account-risk-api/decisions.md"),
      "# 对接决策\n\n## 已确认决策\n- 决策 1：统一返回 riskScore\n\n## 被拒绝方案\n- 方案：同步阻塞调用\n- 拒绝原因：超时风险过高\n\n## 仍待裁决\n- 当前无\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, "specs/integrations/account-risk-api/status.md"),
      "# 对接状态\n\n## 当前状态\n- 状态：`draft`\n- 更新时间：`2026-04-08T00:00:00.000Z`\n- 当前结论：契约已确认，可进入 aligned。\n\n## 当前阻塞\n- 已清空\n\n## 已完成\n- 契约已对齐\n- 责任分工已确认\n\n## 未完成\n- 待实现 provider 代码\n- 待 consumer 接入\n\n## 下一步\n- 下一动作：推进 aligned\n- 责任方：provider / consumer\n- 验证结论：契约人工审阅通过\n",
      "utf8"
    );

    result = runCli(["integration", "check", "account-risk-api", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.integrations[0].id, "account-risk-api");

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.integration.status, "aligned");
    assert.equal(json.data.nextStep.currentPhase, "plan");
    assert.equal(json.data.nextStep.governanceMode, "guided");
    assert.equal(json.data.nextStep.writebackRequired, false);
    assert.equal(typeof json.data.nextStep.updatedAt, "string");

    result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.summary.activeIntegrationCount, 1);
    assert.equal(json.data.repo.integrations.total, 1);
    assert.equal(json.data.repo.integrations.aligned, 1);

    result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.integrations.total, 1);
    assert.equal(json.data.integrations.aligned, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration check 会输出 integration 规则阻断项", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-check-blocking-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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

    const result = runCli(["integration", "check", "account-risk-api", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.runtimeRules.path, ".specnfc/runtime/active-rules.json");
    assert.ok(json.data.blocking.length > 0);
    assert.ok(json.data.blocking.every((item) => item.scope === "integration"));
    assert.ok(json.data.blocking.some((item) => item.code === "PLACEHOLDER_INTEGRATION_CONTRACT"));
    assert.equal(json.data.advisory.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration check 会输出 blocked/ready 决策摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-summary-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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

    const result = runCli(["integration", "check", "account-risk-api", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.summary.total, 1);
    assert.equal(json.data.summary.blockedCount, 1);
    assert.equal(json.data.summary.readyCount, 0);
    assert.ok(json.data.summary.affectedChanges.includes("risk-score-upgrade"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 非 JSON 输出会使用中文协议合同摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-human-zh-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /协议合同健康摘要/);
    assert.match(result.stdout, /下一步协议/);
    assert.match(result.stdout, /变更状态/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration check 会输出当前 integration 的待回写文档", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-check-writeback-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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

    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify({
        items: [
          {
            runtimeArtifactId: "wb-int-1",
            runtimePath: ".nfc/interviews/active/wb-int-1.md",
            targetDocPath: "specs/integrations/account-risk-api/contract.md",
            writebackType: "contract-update",
            syncState: "pending"
          }
        ]
      }, null, 2) + "\n",
      "utf8"
    );

    const result = runCli(["integration", "check", "account-risk-api", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.integrations[0].writeback.targetDocs.includes("specs/integrations/account-risk-api/contract.md"));
    assert.ok(json.data.nextStep.missing.includes("待回写：specs/integrations/account-risk-api/contract.md"));
    assert.ok(json.data.nextStep.recommendedNext.some((item) => item.value === "specs/integrations/account-risk-api/contract.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration check 非 JSON 输出会使用中文协议合同摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-check-human-zh-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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

    const result = runCli(["integration", "check", "account-risk-api", "--cwd", cwd]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /协议合同健康摘要/);
    assert.match(result.stdout, /下一步协议/);
    assert.match(result.stdout, /决策摘要/);
    assert.ok(!result.stdout.includes("ready："));
    assert.ok(!result.stdout.includes("blocked："));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 在 change-id 不合法时返回结构化错误", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-invalid-id-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "check", "@@@", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 2);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_ARGS");
    assert.match(json.error.message, /change-id 不合法/);
    assert.ok(json.next.some((item) => item.includes("specnfc change check risk-device-link")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration check 在 integration-id 不合法时返回结构化错误，而不是退化为全量检查", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-check-invalid-id-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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

    const result = runCli(["integration", "check", "@@@", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 2);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_ARGS");
    assert.match(json.error.message, /integration-id 不合法/);
    assert.ok(json.next.some((item) => item.includes("specnfc integration check account-risk-api")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage 在契约文档未达标时拒绝进入 aligned", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-stage-quality-gate-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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

    const result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /INTEGRATION_RULES_BLOCKING|规则阻断|contract\.md|status\.md/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage 在状态输入不合法时返回结构化错误", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-stage-invalid-state-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "ship-it", "--json"]);
    assert.equal(result.status, 2);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_ARGS");
    assert.match(json.error.message, /未识别的状态：ship-it/);
    assert.ok(json.next.some((item) => item.includes("aligned")));
    assert.ok(json.next.some((item) => item.includes("accept")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change 依赖 draft integration 时禁止进入 in-progress，aligned 后允许", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-integration-gate-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-score-upgrade", "--cwd", cwd, "--title", "风险评分升级", "--json"]);
    runCli([
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

    await fillChangeForExecution(cwd, "risk-score-upgrade", { integrationId: "account-risk-api" });
    await writeReadyIntegrationFiles(cwd, "account-risk-api");

    let result = runCli(["change", "stage", "risk-score-upgrade", "--cwd", cwd, "--to", "in-progress", "--json"]);
    assert.notEqual(result.status, 0);
    let json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /account-risk-api/);

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["change", "stage", "risk-score-upgrade", "--cwd", cwd, "--to", "in-progress", "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.change.stage, "in-progress");

    result = runCli(["change", "check", "risk-score-upgrade", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.changes[0].integrations.refs[0], "account-risk-api");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在存在占位内容风险时返回 attention_needed", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-attention-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    const json = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(json.data.status, "attention_needed");
    assert.ok(
      json.data.risks.some(
        (item) => item.code === "PLACEHOLDER_REQUIREMENTS_AND_SOLUTION" || item.code === "PLACEHOLDER_TECHNICAL_DESIGN"
      )
    );
    assert.equal(json.data.summary.activeChangeCount, 1);
    assert.equal(json.data.changes[0].id, "risk-device-link");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status 在 drift 场景会把具体修复动作带入 next", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-drift-next-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "attention_needed");
    assert.ok(json.data.repo.compliance.recommendedActions.some((item) => item.includes("AGENTS.md")));
    assert.ok(json.data.next.some((item) => item.includes("AGENTS.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status 在无 active change 的组合异常场景仍保持 create-change 主链路", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-composite-no-change-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );
    await rm(path.join(cwd, "specs/project/summary.md"), { force: true });
    await rm(path.join(cwd, ".specnfc/governance/registries/team-policy-registry.json"), { force: true });
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify(
        {
          items: [
            {
              runtimeArtifactId: "wb-status-1",
              runtimePath: ".nfc/interviews/active/wb-status-1.md",
              targetDocPath: "specs/project/summary.md",
              writebackType: "project-summary-update",
              syncState: "pending"
            }
          ]
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "attention_needed");
    assert.equal(json.data.summary.activeChangeCount, 0);
    assert.equal(json.data.repo.nextStepProtocol.primaryAction, "specnfc change create <change-id>");
    assert.equal(json.data.repo.nextStepProtocol.step, "create_change");
    assert.equal(json.data.repo.nextStepProtocol.writebackRequired, true);
    assert.equal(json.data.repo.nextStepProtocol.projectionDrift, true);
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("存在待写回运行时结果"));
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("project-level index 缺失或漂移"));
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("团队 / 项目治理注册中心缺失或损坏"));
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("当前无 active change"));
    assert.ok(json.data.repo.nextStepProtocol.doNotDoYet.some((item) => item.includes("不要先运行 doctor / explain / add 作为默认起手动作")));
    assert.ok(json.data.repo.nextStepProtocol.doNotDoYet.some((item) => item.includes("不要先把治理注册中心修补当作主起手动作")));
    assert.ok(json.data.next.some((item) => item.includes("specnfc change create <change-id>")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status 在 active change + 组合异常场景仍优先引导 change check", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-composite-active-change-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );
    await rm(path.join(cwd, "specs/project/summary.md"), { force: true });
    await rm(path.join(cwd, ".specnfc/governance/registries/team-policy-registry.json"), { force: true });
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify(
        {
          items: [
            {
              runtimeArtifactId: "wb-status-2",
              runtimePath: ".nfc/interviews/active/wb-status-2.md",
              targetDocPath: "specs/changes/risk-device-link/01-需求与方案.md",
              writebackType: "requirements-update",
              syncState: "pending"
            }
          ]
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "attention_needed");
    assert.equal(json.data.summary.activeChangeCount, 1);
    assert.equal(json.data.repo.nextStepProtocol.primaryAction, "specnfc change check risk-device-link");
    assert.equal(json.data.repo.nextStepProtocol.step, "check_active_change");
    assert.equal(json.data.repo.nextStepProtocol.primaryDoc, "specs/changes/risk-device-link/01-需求与方案.md");
    assert.equal(json.data.repo.nextStepProtocol.writebackRequired, true);
    assert.equal(json.data.repo.nextStepProtocol.projectionDrift, true);
    assert.equal(json.data.repo.nextStepProtocol.interviewRound, 1);
    assert.equal(json.data.repo.nextStepProtocol.interviewTarget, "问题定义与目标");
    assert.equal(json.data.repo.nextStepProtocol.ambiguityPercent, 100);
    assert.ok(json.data.repo.nextStepProtocol.readinessGates.some((item) => item.name === "问题定义与目标" && item.status === "focus"));
    assert.ok(json.data.repo.nextStepProtocol.focusQuestion.includes("真正要解决的问题"));
    assert.deepEqual(json.data.repo.nextStepProtocol.writebackSections, ["问题定义", "目标"]);
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("存在待写回运行时结果"));
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("project-level index 缺失或漂移"));
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("团队 / 项目治理注册中心缺失或损坏"));
    assert.ok(json.data.repo.nextStepProtocol.completed.some((item) => item.includes("已识别最高优先 change：risk-device-link")));
    assert.ok(json.data.repo.nextStepProtocol.doNotDoYet.some((item) => item.includes("不要跳过 `specs/changes/risk-device-link/01-需求与方案.md`")));
    assert.ok(json.data.next.some((item) => item.includes("specnfc change check risk-device-link")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 会输出结构化最高优先事项", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-priority-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.summary.highestPriorityChange.id, "risk-device-link");
    assert.equal(json.data.summary.highestPriorityChange.stage, "draft");
    assert.ok(json.data.summary.highestPriorityChange.action.includes("范围和验收口径"));
    assert.ok(json.data.summary.highestPriorityChange.gaps.some((item) => item.code === "MISSING_REQUIREMENTS_SCOPE"));
    assert.ok(json.data.next.some((item) => item.includes("risk-device-link")));
    assert.ok(json.data.next.some((item) => item.includes("范围和验收口径")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在 enterprise 草稿 change 中优先提示补规格而不是补交付", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-priority-enterprise-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.summary.highestPriorityChange.id, "risk-device-link");
    assert.ok(json.data.summary.highestPriorityChange.action.includes("范围和验收口径"));
    assert.ok(!json.data.summary.highestPriorityChange.action.includes("提交说明"));
    assert.ok(json.data.summary.highestPriority.includes("范围和验收口径"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在活跃 change 无关键阻塞时返回 in_progress", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-progress-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");
    runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "in-progress", "--json"]);

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    const json = JSON.parse(result.stdout);

    assert.equal(json.data.status, "in_progress");
    assert.equal(json.data.changes[0].stage, "in-progress");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在 verifying 且交付前置满足时返回 ready_for_handoff", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-handoff-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/evidence/reviews/design-review.json"),
      `${JSON.stringify({
        recordId: "design-review",
        scope: "change",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "设计评审通过",
        evidenceRefs: ["specs/changes/risk-device-link/02-技术设计与选型.md"],
        createdAt: "2026-04-15T09:00:00.000Z"
      }, null, 2)}\n`,
      "utf8"
    );
    runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "verifying", "--json"]);

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    const json = JSON.parse(result.stdout);

    assert.equal(json.data.status, "ready_for_handoff");
    assert.ok(json.data.next.some((item) => item.includes("specnfc change handoff risk-device-link")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 会输出对接依赖关系与 release 就绪摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-integration-readiness-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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
    runCli(["change", "create", "risk-score-upgrade", "--cwd", cwd, "--title", "风险评分升级", "--json"]);
    await fillChangeForExecution(cwd, "risk-score-upgrade", { integrationId: "account-risk-api" });

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.summary.relationships.totalIntegrationRefs, 1);
    assert.equal(json.data.summary.relationships.changesBlockedByIntegrationCount, 1);
    assert.equal(json.data.summary.readiness.blockedIntegrationRefCount, 1);
    assert.ok(json.data.summary.readiness.releaseBlockerCount >= 1);
    assert.equal(json.data.changes[0].integrations.blocked[0].id, "account-risk-api");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会把旧 change 结构补齐到最新模板版本", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "legacy-change", "--cwd", cwd, "--title", "旧版变更", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.specnfc.version = "0.9.0";
    config.specnfc.templateVersion = "0.9.0";
    config.defaults.changeStructure = [
      "spec.md",
      "capabilities.md",
      "spec-deltas.md",
      "plan.md",
      "tasks.md",
      "decisions.md",
      "status.md"
    ];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const legacyChangeRoot = path.join(cwd, "specs/changes/legacy-change");
    await writeFile(path.join(legacyChangeRoot, "spec.md"), "# 自定义规格\n\n保留已有内容。\n", "utf8");
    await rm(path.join(legacyChangeRoot, "01-需求与方案.md"), { force: true });
    await rm(path.join(legacyChangeRoot, "02-技术设计与选型.md"), { force: true });

    const result = runCli(["upgrade", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.fromVersion, "0.9.0");
    assert.equal(json.data.toVersion, PACKAGE_VERSION);
    assert.ok(json.data.changeFilesCreated.some((item) => item.endsWith("/01-需求与方案.md")));
    assert.ok(json.data.changeFilesCreated.some((item) => item.endsWith("/02-技术设计与选型.md")));

    const nextConfig = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(nextConfig.specnfc.templateVersion, PACKAGE_VERSION);
    assert.deepEqual(nextConfig.defaults.changeStructure, [
      "01-需求与方案.md",
      "02-技术设计与选型.md",
      "03-任务计划与执行.md",
      "04-验收与交接.md"
    ]);

    const proposal = await readFile(path.join(legacyChangeRoot, "01-需求与方案.md"), "utf8");
    const design = await readFile(path.join(legacyChangeRoot, "02-技术设计与选型.md"), "utf8");
    const spec = await readFile(path.join(legacyChangeRoot, "spec.md"), "utf8");
    const meta = JSON.parse(await readFile(path.join(legacyChangeRoot, "meta.json"), "utf8"));
    assert.match(proposal, /需求与方案/);
    assert.match(design, /技术设计与选型/);
    assert.match(spec, /保留已有内容/);
    assert.equal(meta.canonicalStage, "clarify");
    assert.equal(meta.legacyStage, "draft");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会把 waiver 失效与 projection / skill-pack 漂移纳入风险摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-waiver-drift-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );

    const skillPackManifestPath = path.join(cwd, ".specnfc/skill-packs/active/manifest.json");
    const skillPackManifest = JSON.parse(await readFile(skillPackManifestPath, "utf8"));
    skillPackManifest.version = "0.0.0-test";
    await writeFile(skillPackManifestPath, `${JSON.stringify(skillPackManifest, null, 2)}\n`, "utf8");

    await writeFile(
      path.join(cwd, ".specnfc/governance/waivers/expired-projection.json"),
      `${JSON.stringify(
        {
          waiverId: "expired-projection",
          scope: "repository",
          target: "projectionStatus",
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

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.riskSummary.some((item) => item.code === "WAIVER_EXPIRED"));
    assert.ok(json.data.riskSummary.some((item) => item.code === "PROJECTION_DRIFT_REVIEW"));
    assert.ok(json.data.riskSummary.some((item) => item.code === "SKILL_PACK_DRIFT_REVIEW"));
    assert.ok(json.data.manualActions.some((item) => item.code === "RENEW_EXPIRED_WAIVERS"));
    assert.ok(json.data.manualActions.some((item) => item.code === "PROJECTION_DRIFT_REVIEW"));
    assert.ok(json.data.manualActions.some((item) => item.code === "SKILL_PACK_DRIFT_REVIEW"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade --dry-run 会同时汇总 projection drift、skill-pack drift 与 legacy runtime", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-combined-runtime-drift-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );

    const skillPackManifestPath = path.join(cwd, ".specnfc/skill-packs/active/manifest.json");
    const skillPackManifest = JSON.parse(await readFile(skillPackManifestPath, "utf8"));
    skillPackManifest.version = "0.0.0-test";
    await writeFile(skillPackManifestPath, `${JSON.stringify(skillPackManifest, null, 2)}\n`, "utf8");

    await mkdir(path.join(cwd, ".omx/context"), { recursive: true });
    await writeFile(path.join(cwd, ".omx/context/legacy.md"), "# legacy\n", "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.riskSummary.some((item) => item.code === "PROJECTION_DRIFT_REVIEW"));
    assert.ok(json.data.riskSummary.some((item) => item.code === "SKILL_PACK_DRIFT_REVIEW"));
    assert.equal(json.data.runtimeMigration.detected, true);
    assert.equal(json.data.runtimeMigration.reportPath, ".nfc/migration-from-omx.json");
    assert.ok(json.data.manualActions.some((item) => item.code === "PROJECTION_DRIFT_REVIEW"));
    assert.ok(json.data.manualActions.some((item) => item.code === "SKILL_PACK_DRIFT_REVIEW"));
    assert.ok(json.data.manualActions.some((item) => item.code === "REVIEW_LEGACY_RUNTIME_MIGRATION"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会把无效 waiver 纳入风险摘要与人工动作", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-invalid-waiver-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, ".specnfc/governance/waivers/invalid-waiver.json"),
      `${JSON.stringify(
        {
          waiverId: "invalid-waiver",
          scope: "repository",
          reason: "故意缺少 target 用于测试",
          approvedBy: "team-architect",
          createdAt: "2026-04-13T00:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.riskSummary.some((item) => item.code === "WAIVER_INVALID"));
    assert.ok(json.data.manualActions.some((item) => item.code === "REVIEW_INVALID_WAIVERS"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会把无效治理记录纳入风险摘要与人工动作", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-invalid-governance-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "demo-governance", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, "specs/changes/demo-governance/evidence/reviews/broken-scope-review.json"),
      `${JSON.stringify(
        {
          recordId: "broken-scope-review",
          scope: "integration",
          targetId: "demo-governance",
          stage: "design",
          reviewType: "design",
          reviewer: "architect",
          verdict: "approved",
          summary: "故意制造无效治理记录",
          evidenceRefs: ["specs/changes/demo-governance/design.md"],
          createdAt: "2026-04-15T06:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.riskSummary.some((item) => item.code === "GOVERNANCE_INVALID"));
    assert.ok(json.data.manualActions.some((item) => item.code === "REPAIR_INVALID_GOVERNANCE_RECORDS"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade --dry-run 只输出升级计划，不写入文件", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-dry-run-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "legacy-change", "--cwd", cwd, "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.specnfc.templateVersion = "0.9.0";
    config.defaults.changeStructure = ["spec.md", "plan.md", "tasks.md", "decisions.md", "status.md"];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const legacyChangeRoot = path.join(cwd, "specs/changes/legacy-change");
    await writeFile(path.join(legacyChangeRoot, "spec.md"), "# 旧版规格\n\n保留已有内容。\n", "utf8");
    await rm(path.join(legacyChangeRoot, "01-需求与方案.md"), { force: true });
    await rm(path.join(legacyChangeRoot, "02-技术设计与选型.md"), { force: true });

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.changeFilesCreated.some((item) => item.endsWith("/01-需求与方案.md")));
    assert.ok(json.data.updatedConfig.templateVersionChanged);
    assert.ok(json.data.impactSummary.changeFilesCreatedCount >= 2);
    assert.equal(json.data.supportAssessment.level, "supported");
    assert.ok(json.data.manualActions.some((item) => item.code === "REVIEW_BACKFILLED_CHANGE_FILES"));
    assert.equal(json.data.migrationSummary.fromVersion, "0.9.0");
    assert.equal(json.data.migrationSummary.toVersion, PACKAGE_VERSION);
    assert.ok(json.data.migrationSummary.changeStructure.addedFiles.includes("01-需求与方案.md"));
    assert.ok(json.data.migrationSummary.changeStructure.addedFiles.includes("02-技术设计与选型.md"));

    assert.equal((await readFile(configPath, "utf8")).includes('"templateVersion": "0.9.0"'), true);
    assert.equal(await fileExists(path.join(legacyChangeRoot, "01-需求与方案.md")), false);
    assert.equal(await fileExists(path.join(legacyChangeRoot, "02-技术设计与选型.md")), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change create 在旧版 changeStructure 漂移时拒绝继续并要求先 upgrade", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-create-legacy-structure-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.defaults.changeStructure = [
      "proposal.md",
      "design.md",
      "spec.md",
      "capabilities.md",
      "spec-deltas.md",
      "plan.md",
      "tasks.md",
      "decisions.md",
      "status.md",
      "acceptance.md"
    ];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["change", "create", "legacy-blocked", "--cwd", cwd, "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_CONFIG");
    assert.match(json.error.message, /defaults\.changeStructure/);
    assert.ok(json.next.some((item) => item.includes("specnfc upgrade")));
    assert.equal(await fileExists(path.join(cwd, "specs/changes/legacy-blocked")), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 后新建 change 不会再生成旧十文档与额外交付文档", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-new-change-structure-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.specnfc.version = "3.0.0";
    config.specnfc.templateVersion = "3.0.0";
    config.defaults.changeStructure = [
      "proposal.md",
      "design.md",
      "spec.md",
      "capabilities.md",
      "spec-deltas.md",
      "plan.md",
      "tasks.md",
      "decisions.md",
      "status.md",
      "acceptance.md"
    ];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const upgradeResult = runCli(["upgrade", "--cwd", cwd, "--json"]);
    assert.equal(upgradeResult.status, 0);

    const createResult = runCli(["change", "create", "post-upgrade-change", "--cwd", cwd, "--json"]);
    assert.equal(createResult.status, 0);

    const changeRoot = path.join(cwd, "specs/changes/post-upgrade-change");
    for (const fileName of [
      "01-需求与方案.md",
      "02-技术设计与选型.md",
      "03-任务计划与执行.md",
      "04-验收与交接.md"
    ]) {
      assert.equal(await fileExists(path.join(changeRoot, fileName)), true);
    }

    for (const fileName of [
      "proposal.md",
      "design.md",
      "spec.md",
      "capabilities.md",
      "spec-deltas.md",
      "plan.md",
      "tasks.md",
      "decisions.md",
      "status.md",
      "acceptance.md",
      "commit-message.md",
      "delivery-checklist.md"
    ]) {
      assert.equal(await fileExists(path.join(changeRoot, fileName)), false);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 会提示仓内仍使用旧 changeStructure 但不打断主链路", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-legacy-change-structure-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.defaults.changeStructure = [
      "proposal.md",
      "design.md",
      "spec.md",
      "capabilities.md",
      "spec-deltas.md",
      "plan.md",
      "tasks.md",
      "decisions.md",
      "status.md",
      "acceptance.md"
    ];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "healthy_idle");
    assert.ok(json.data.repo.repositoryAdvisories.some((item) => item.code === "CHANGE_STRUCTURE_DRIFT"));
    assert.ok(json.data.repo.compliance.advisoryIssues.some((item) => item.startsWith("CHANGE_STRUCTURE_DRIFT")));
    assert.equal(json.data.repo.nextStepProtocol.primaryAction, "specnfc change create <change-id>");
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("仓内 defaults.changeStructure 仍不是 3.1 四主文档结构"));
    assert.ok(json.data.repo.nextStepProtocol.recommendedNext.some((item) => item.type === "cli" && item.value === "specnfc upgrade"));
    assert.ok(json.data.next.some((item) => item.includes("specnfc upgrade")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor --json 会把旧 changeStructure 纳入 advisory 并给出 upgrade 建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-legacy-change-structure-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.defaults.changeStructure = ["proposal.md", "design.md", "spec.md", "plan.md", "status.md"];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.repositoryAdvisories.some((item) => item.code === "CHANGE_STRUCTURE_DRIFT"));
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.startsWith("CHANGE_STRUCTURE_DRIFT")));
    assert.ok(
      json.data.compliance.recommendedActions.some(
        (item) => item.includes("specnfc upgrade") && item.includes("defaults.changeStructure")
      )
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会刷新受追踪且未改动的模块模板文件", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-tracked-module-"));

  try {
    runCli(["init", "--cwd", cwd, "--with", "execution", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const targetPath = path.join(cwd, ".specnfc/execution/team-runtime.md");
    const oldContent = "旧模板内容\n";
    await writeFile(targetPath, oldContent, "utf8");
    config.managedFiles = {
      ...(config.managedFiles || {}),
      ".specnfc/execution/team-runtime.md": hash(oldContent)
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.managedFilesRefreshed.includes(".specnfc/execution/team-runtime.md"));

    const nextContent = await readFile(targetPath, "utf8");
    assert.notEqual(nextContent, oldContent);
    assert.match(nextContent, /团队运行|leader|worker|派单|回收/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会补齐缺失的 control-plane 文件并生成 legacy runtime 迁移报告", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-protocol-runtime-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    await rm(path.join(cwd, ".specnfc/contract"), { recursive: true, force: true });
    await rm(path.join(cwd, ".specnfc/indexes"), { recursive: true, force: true });
    await rm(path.join(cwd, ".nfc"), { recursive: true, force: true });
    await mkdir(path.join(cwd, ".omx/context"), { recursive: true });
    await writeFile(path.join(cwd, ".omx/context/legacy.md"), "# legacy\n", "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/contract/repo.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/bootstrap-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/add-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/init-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/version-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/explain-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/demo-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/upgrade-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/release-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/design/status-output.schema.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".nfc/runtime.json"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/skill-packs/active/workflow/clarify.md"));
    assert.ok(json.data.protocolFilesCreated.includes(".specnfc/skill-packs/active/prompts/role.md"));
    assert.equal(json.data.runtimeMigration.detected, true);
    assert.equal(json.data.runtimeMigration.reportPath, ".nfc/migration-from-omx.json");
    assert.ok(json.data.manualActions.some((item) => item.code === "REVIEW_LEGACY_RUNTIME_MIGRATION"));

    const repoContract = JSON.parse(await readFile(path.join(cwd, ".specnfc/contract/repo.json"), "utf8"));
    const schemaMap = await loadDesignSchemas(
      [
        "add-output.schema.json",
        "bootstrap-output.schema.json",
        "init-output.schema.json",
        "version-output.schema.json",
        "explain-output.schema.json",
        "demo-output.schema.json",
        "upgrade-output.schema.json",
        "release-output.schema.json",
        "status-output.schema.json"
      ],
      { root: cwd }
    );
    const addOutputSchema = schemaMap["add-output.schema.json"];
    const bootstrapOutputSchema = schemaMap["bootstrap-output.schema.json"];
    const initOutputSchema = schemaMap["init-output.schema.json"];
    const versionOutputSchema = schemaMap["version-output.schema.json"];
    const explainOutputSchema = schemaMap["explain-output.schema.json"];
    const demoOutputSchema = schemaMap["demo-output.schema.json"];
    const upgradeOutputSchema = schemaMap["upgrade-output.schema.json"];
    const releaseOutputSchema = schemaMap["release-output.schema.json"];
    const statusOutputSchema = schemaMap["status-output.schema.json"];
    const runtimeMigration = JSON.parse(await readFile(path.join(cwd, ".nfc/migration-from-omx.json"), "utf8"));
    const restoredClarifySkill = await readFile(path.join(cwd, ".specnfc/skill-packs/active/workflow/clarify.md"), "utf8");
    assert.equal(bootstrapOutputSchema.title, "specnfc bootstrap script --json output");
    assert.equal(addOutputSchema.title, "specnfc add --json output");
    assert.equal(repoContract.activeSkillPack.id, "specnfc-zh-cn-default");
    assert.equal(initOutputSchema.title, "specnfc init --json output");
    assert.equal(versionOutputSchema.title, "specnfc version --json output");
    assert.equal(explainOutputSchema.title, "specnfc explain --json output");
    assert.equal(demoOutputSchema.title, "specnfc demo --json output");
    assert.equal(upgradeOutputSchema.title, "specnfc upgrade --json output");
    assert.equal(releaseOutputSchema.title, "specnfc release script --json output");
    assert.equal(statusOutputSchema.title, "specnfc status --json output");
    assert.equal(runtimeMigration.detected, true);
    assert.ok(restoredClarifySkill.includes("当前阶段"));
    assert.equal(JSON.parse(await readFile(path.join(cwd, ".nfc/runtime.json"), "utf8")).skillAccess.mode, "source-only");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会跳过受追踪但已被手工改动的模块模板文件", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-conflict-module-"));

  try {
    runCli(["init", "--cwd", cwd, "--with", "execution", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const targetPath = path.join(cwd, ".specnfc/execution/team-runtime.md");
    const trackedContent = "旧模板内容\n";
    const manualContent = "手工改过的 team runtime 内容\n";
    await writeFile(targetPath, manualContent, "utf8");
    config.managedFiles = {
      ...(config.managedFiles || {}),
      ".specnfc/execution/team-runtime.md": hash(trackedContent)
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.managedFilesConflicted.includes(".specnfc/execution/team-runtime.md"));
    assert.equal(json.data.supportAssessment.level, "supported_with_manual_review");
    assert.ok(json.data.riskSummary.some((item) => item.code === "MANAGED_FILE_CONFLICT"));
    assert.ok(json.data.manualActions.some((item) => item.code === "RESOLVE_CONFLICTED_FILES"));
    assert.equal(await readFile(targetPath, "utf8"), manualContent);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 会把大量未纳入追踪的模板定制标记为超出支持范围", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-out-of-scope-"));

  try {
    runCli(["init", "--cwd", cwd, "--with", "governance", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    delete config.managedFiles["AGENTS.md"];
    delete config.managedFiles["CLAUDE.md"];
    delete config.managedFiles["opencode.json"];
    delete config.managedFiles[".trae/rules/project_rules.md"];
    await writeFile(path.join(cwd, "AGENTS.md"), "# 本地定制 AGENTS\n", "utf8");
    await writeFile(path.join(cwd, "CLAUDE.md"), "# 本地定制 CLAUDE\n", "utf8");
    await writeFile(path.join(cwd, "opencode.json"), '{\"instructions\":[\"local-only\"]}\n', "utf8");
    await writeFile(path.join(cwd, ".trae/rules/project_rules.md"), "# 本地定制 Trae 规则\n", "utf8");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.supportAssessment.level, "out_of_scope");
    assert.ok(json.data.managedFilesSkipped.includes("AGENTS.md"));
    assert.ok(json.data.managedFilesSkipped.includes("CLAUDE.md"));
    assert.ok(json.data.riskSummary.some((item) => item.code === "UPGRADE_SCOPE_EXCEEDED"));
    assert.ok(json.data.manualActions.some((item) => item.code === "MANUAL_UPGRADE_REQUIRED"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade --dry-run 会输出受管文件差异预览", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-diff-preview-"));

  try {
    runCli(["init", "--cwd", cwd, "--with", "execution", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const targetPath = path.join(cwd, ".specnfc/execution/team-runtime.md");
    const oldContent = "旧模板内容\n";
    await writeFile(targetPath, oldContent, "utf8");
    config.managedFiles = {
      ...(config.managedFiles || {}),
      ".specnfc/execution/team-runtime.md": hash(oldContent)
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    const diffItem = json.data.managedFileDiffs.refreshed.find((item) => item.target === ".specnfc/execution/team-runtime.md");
    assert.ok(diffItem);
    assert.ok(diffItem.diff.changed);
    assert.ok(diffItem.diff.addedCount > 0 || diffItem.diff.removedCount > 0);
    assert.ok(Array.isArray(diffItem.diff.preview));
    assert.ok(diffItem.diff.preview.length > 0);
    assert.equal(typeof diffItem.diff.unified, "string");
    assert.match(diffItem.diff.unified, /^--- a\/\.specnfc\/execution\/team-runtime\.md/m);
    assert.match(diffItem.diff.unified, /^\+\+\+ b\/\.specnfc\/execution\/team-runtime\.md/m);
    assert.match(diffItem.diff.unified, /^@@ /m);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade 冲突项会输出 unified diff 预览", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-upgrade-conflict-diff-"));

  try {
    runCli(["init", "--cwd", cwd, "--with", "execution", "--json"]);

    const configPath = path.join(cwd, ".specnfc/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const targetPath = path.join(cwd, ".specnfc/execution/team-runtime.md");
    const trackedContent = "旧模板内容\n";
    const manualContent = "手工改动内容\n";
    await writeFile(targetPath, manualContent, "utf8");
    config.managedFiles = {
      ...(config.managedFiles || {}),
      ".specnfc/execution/team-runtime.md": hash(trackedContent)
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = runCli(["upgrade", "--cwd", cwd, "--dry-run", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    const diffItem = json.data.managedFileDiffs.conflicted.find((item) => item.target === ".specnfc/execution/team-runtime.md");
    assert.ok(diffItem);
    assert.equal(typeof diffItem.diff.unified, "string");
    assert.match(diffItem.diff.unified, /^--- a\/\.specnfc\/execution\/team-runtime\.md/m);
    assert.match(diffItem.diff.unified, /^\+\+\+ b\/\.specnfc\/execution\/team-runtime\.md/m);
    assert.match(diffItem.diff.unified, /^@@ /m);
    assert.match(diffItem.diff.unified, /-手工改动内容/);
    assert.match(diffItem.diff.unified, /\+# 团队运行规则/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("explain modules 输出支持的模块列表", async () => {
  const result = runCli(["explain", "modules", "--json"]);
  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.ok(json.data.modules.some((item) => item.includes("context")));
});

test("explain tools 输出多工具接入说明", async () => {
  const result = runCli(["explain", "tools", "--json"]);
  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.ok(json.data.content.includes("Codex / OpenCode"));
  assert.ok(json.data.content.includes("CLAUDE.md"));
});

test("explain skills 输出个人 Skills 兼容说明", async () => {
  const result = runCli(["explain", "skills", "--json"]);
  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.ok(json.data.content.includes("个人 Skills 兼容说明"));
  assert.ok(json.data.content.includes("不能覆盖仓内正式规范"));
});

test("explain install 输出安装说明", async () => {
  const result = runCli(["explain", "install", "--json"]);
  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.ok(json.data.content.includes("安装说明"));
  assert.ok(json.data.content.includes("Node.js >= 20"));
});

test("explain maturity 输出规格成熟度说明", async () => {
  const result = runCli(["explain", "maturity", "--json"]);
  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.data.topic, "maturity");
  assert.ok(json.data.content.includes("规格成熟度"));
  assert.ok(json.data.content.includes("draft"));
  assert.ok(json.data.content.includes("incomplete"));
});

test("explain handoff 输出交接说明", async () => {
  const result = runCli(["explain", "handoff", "--json"]);
  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.data.topic, "handoff");
  assert.ok(json.data.content.includes("交接"));
  assert.ok(json.data.content.includes("04-验收与交接.md"));
  assert.ok(json.data.content.includes("release-handoff.md"));
});

test("bootstrap 脚本 dry-run 输出安装计划", async () => {
  const result = spawnSync(process.execPath, [BOOTSTRAP_PATH, "--dry-run", "--json"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);

  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.data.dryRun, true);
  assert.ok(json.data.steps.some((item) => item.id === "npm-install"));
  assert.ok(json.data.steps.some((item) => item.id === "verify-local-cli"));
});

test("change create 可以创建标准变更目录", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-create-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    const result = runCli([
      "change",
      "create",
      "risk-device-link",
      "--cwd",
      cwd,
      "--title",
      "设备关联风险识别增强",
      "--json"
    ]);

    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.change.changeId, "risk-device-link");
    assert.equal(json.data.change.canonicalStage, "clarify");
    assert.equal(json.data.nextStep.currentPhase, "clarify");
    assert.equal(json.data.nextStep.governanceMode, "guided");
    assert.equal(json.data.nextStep.writebackRequired, false);
    assert.equal(json.data.nextStep.projectionDrift, false);
    assert.equal(json.data.nextStep.skillPackDrift, false);
    assert.equal(typeof json.data.nextStep.updatedAt, "string");

    const meta = JSON.parse(
      await readFile(path.join(cwd, "specs/changes/risk-device-link/meta.json"), "utf8")
    );
    const activeChange = JSON.parse(
      await readFile(path.join(cwd, ".specnfc/execution/active-change.ref.json"), "utf8")
    );
    const changeIndex = JSON.parse(
      await readFile(path.join(cwd, ".specnfc/indexes/change-index.json"), "utf8")
    );
    const runtimeLinks = JSON.parse(
      await readFile(path.join(cwd, "specs/changes/risk-device-link/runtime-links.json"), "utf8")
    );
    assert.equal(meta.title, "设备关联风险识别增强");
    assert.equal(meta.canonicalStage, "clarify");
    assert.equal(meta.legacyStage, "draft");
    assert.equal(activeChange.changeId, "risk-device-link");
    assert.equal(activeChange.path, "specs/changes/risk-device-link");
    assert.ok(changeIndex.items.some((item) => item.id === "risk-device-link" && item.path === "specs/changes/risk-device-link"));
    assert.equal(runtimeLinks.scope, "change");
    assert.equal(runtimeLinks.targetId, "risk-device-link");
    assert.equal(meta.docRoles.requirementsAndSolution, "01-需求与方案.md");
    assert.equal(meta.docRoles.technicalDesign, "02-技术设计与选型.md");
    assert.equal(meta.docRoles.planAndExecution, "03-任务计划与执行.md");
    assert.equal(meta.docRoles.acceptanceAndHandoff, "04-验收与交接.md");

    const requirementsAndSolution = await readFile(path.join(cwd, "specs/changes/risk-device-link/01-需求与方案.md"), "utf8");
    assert.ok(requirementsAndSolution.includes("需求与方案"));
    await readFile(path.join(cwd, "specs/changes/risk-device-link/02-技术设计与选型.md"), "utf8");
    await readFile(path.join(cwd, "specs/changes/risk-device-link/03-任务计划与执行.md"), "utf8");
    await readFile(path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"), "utf8");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("启用 delivery 时 change create 仍以 04-验收与交接 作为交付主文档", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-delivery-"));

  try {
    const initResult = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(initResult.status, 0);

    const result = runCli([
      "change",
      "create",
      "risk-device-link",
      "--cwd",
      cwd,
      "--title",
      "设备关联风险识别增强",
      "--json"
    ]);
    assert.equal(result.status, 0);

    await readFile(path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"), "utf8");
    assert.equal(await fileExists(path.join(cwd, "specs/changes/risk-device-link/commit-message.md")), false);
    assert.equal(await fileExists(path.join(cwd, "specs/changes/risk-device-link/delivery-checklist.md")), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change list 可以列出当前 change", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-list-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli([
      "change",
      "create",
      "risk-device-link",
      "--cwd",
      cwd,
      "--title",
      "设备关联风险识别增强",
      "--json"
    ]);

    const result = runCli(["change", "list", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.changes.length, 1);
    assert.equal(json.data.changes[0].id, "risk-device-link");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("启用 delivery 时 change list 会显示交付状态", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-list-delivery-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "list", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.changes[0].maturity.status, "draft");
    assert.equal(json.data.changes[0].maturity.summary, "待补规格");
    assert.equal(json.data.changes[0].delivery.status, "prepared");
    assert.equal(json.data.changes[0].delivery.summary, "验收与交接待完善");
    assert.equal(json.data.changes[0].delivery.action, "先完善 04-验收与交接.md");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 可以发现缺失文件", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await rm(path.join(cwd, "specs/changes/risk-device-link/03-任务计划与执行.md"), { force: true });

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.missing.some((item) => item.endsWith("/03-任务计划与执行.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("启用 delivery 时 change check 会发现缺少验收与交接主文档", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-delivery-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await rm(path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"), { force: true });

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.missing.some((item) => item.endsWith("/04-验收与交接.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("启用 delivery 时 change check 会发现占位验收与交接内容未完善", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-delivery-placeholder-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.risks.some((item) => item.code === "PLACEHOLDER_ACCEPTANCE_AND_HANDOFF"));
    assert.ok(json.next.some((item) => item.includes("04-验收与交接.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 会发现四主文档仍是占位内容", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-capability-placeholders-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.risks.some((item) => item.code === "PLACEHOLDER_REQUIREMENTS_AND_SOLUTION"));
    assert.ok(json.data.risks.some((item) => item.code === "PLACEHOLDER_PLAN_AND_EXECUTION"));
    assert.ok(json.data.risks.some((item) => item.code === "PLACEHOLDER_ACCEPTANCE_AND_HANDOFF"));
    assert.equal(json.data.nextStep.step, "clarify_requirements");
    assert.equal(json.data.nextStep.primaryDoc, "01-需求与方案.md");
    assert.equal(json.data.nextStep.interviewRound, 1);
    assert.equal(json.data.nextStep.interviewTarget, "问题定义与目标");
    assert.equal(json.data.nextStep.ambiguityPercent, 100);
    assert.ok(json.data.nextStep.readinessGates.some((item) => item.name === "问题定义与目标" && item.status === "focus"));
    assert.ok(json.data.nextStep.focusQuestion.includes("真正要解决的问题"));
    assert.deepEqual(json.data.nextStep.writebackSections, ["问题定义", "目标"]);
    assert.ok(json.next.some((item) => item.includes("01-需求与方案.md")));
    assert.ok(json.next.some((item) => item.includes("03-任务计划与执行.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 会输出 change 规则阻断项", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-blocking-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.runtimeRules.path, ".specnfc/runtime/active-rules.json");
    assert.ok(json.data.blocking.length > 0);
    assert.ok(json.data.blocking.every((item) => item.scope === "change"));
    assert.ok(json.data.blocking.some((item) => item.code === "PLACEHOLDER_REQUIREMENTS_AND_SOLUTION"));
    assert.equal(json.data.advisory.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 会输出关键规格缺口的细分结构", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-maturity-gaps-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.nextStep.currentPhase, "clarify");

    const requirementsRisk = json.data.risks.find((item) => item.code === "PLACEHOLDER_REQUIREMENTS_AND_SOLUTION");
    const planRisk = json.data.risks.find((item) => item.code === "PLACEHOLDER_PLAN_AND_EXECUTION");

    assert.ok(requirementsRisk);
    assert.ok(planRisk);
    assert.ok(requirementsRisk.details.some((item) => item.code === "MISSING_REQUIREMENTS_SCOPE"));
    assert.ok(requirementsRisk.details.some((item) => item.code === "MISSING_REQUIREMENTS_ACCEPTANCE"));
    assert.ok(planRisk.details.some((item) => item.code === "MISSING_EXECUTION_STATUS"));
    assert.ok(planRisk.details.some((item) => item.code === "MISSING_EXECUTION_NEXT"));

    const gapCodes = json.data.changes[0].maturity.gaps.map((item) => item.code);
    assert.ok(gapCodes.includes("MISSING_REQUIREMENTS_SCOPE"));
    assert.ok(gapCodes.includes("MISSING_REQUIREMENTS_ACCEPTANCE"));
    assert.ok(gapCodes.includes("MISSING_EXECUTION_NEXT"));
    assert.ok(json.data.nextStep.requiredSections.includes("风险与验收口径"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 会阻断未确认的需求当前选择", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-unconfirmed-requirements-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/01-需求与方案.md"),
      `# 需求与方案

## 问题定义

当前问题：需要验证未确认选择会被门禁拦截。

## 目标

- 目标 1：形成一个带当前选择但未确认的样例。

## 非目标

- 本次不做 1：不进入任务计划。
- 本次不做 2：不进入实现。

## 范围

- 本次包含：只覆盖澄清门禁。
- 本次不包含：不覆盖后续阶段。

## 方案备选

### 方案 A
- 做法：直接进入 03。
- 优点：路径短。
- 风险：可能误判。

### 方案 B
- 做法：先补设计。
- 优点：更稳。
- 风险：成本高。

## 当前选择

- 当前选择：先直接进入 03。
- 选择理由：当前判断是低复杂度。
- 不选其他方案的原因：希望减少步骤。

## 澄清确认记录

- 当前轮次：4
- 最近一次确认问题：
- 最近一次用户答复摘要：
- 当前选择是否已确认：否
- 尚待确认事项：是否确认直接进入 03

## 风险与验收口径

- 关键风险：未确认就推进会导致误解。
- 验收口径：check 明确阻断。
`,
      "utf8"
    );

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.risks.some((item) => item.code === "UNCONFIRMED_REQUIREMENTS_SELECTION"));
    assert.equal(json.data.nextStep.currentPhase, "clarify");
    assert.ok(json.data.nextStep.requiredSections.includes("澄清确认记录"));
    assert.ok(json.data.nextStep.focusQuestion.includes("请明确确认"));
    assert.ok(json.next.some((item) => item.includes("澄清确认记录")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 会阻断未确认的技术选型结论", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-unconfirmed-technical-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/01-需求与方案.md"),
      `# 需求与方案

## 问题定义

当前问题：需要验证未确认技术选型会被门禁拦截。

## 目标

- 目标 1：进入技术设计阶段。

## 非目标

- 本次不做 1：不直接进入实现。
- 本次不做 2：不跳过设计。

## 范围

- 本次包含：只覆盖技术设计门禁。
- 本次不包含：不覆盖后续阶段。

## 方案备选

### 方案 A
- 做法：先做技术设计。
- 优点：边界清晰。
- 风险：流程更长。

### 方案 B
- 做法：直接进入 03。
- 优点：速度快。
- 风险：设计未闭合。

## 当前选择

- 当前选择：先做技术设计。
- 选择理由：涉及技术选型。
- 不选其他方案的原因：直接进入 03 风险过高。

## 澄清确认记录

- 当前轮次：4
- 最近一次确认问题：是否先进入独立技术设计？
- 最近一次用户答复摘要：确认先做技术设计。
- 当前选择是否已确认：是
- 尚待确认事项：无

## 风险与验收口径

- 关键风险：技术取舍错误会放大返工。
- 验收口径：进入设计门禁。
`,
      "utf8"
    );
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/02-技术设计与选型.md"),
      `# 技术设计与选型

## 触发说明

- 复杂度：中
- 是否涉及架构取舍：是
- 是否涉及技术选型：是
- 如不触发独立技术设计，请在此说明原因：不适用

## 技术背景与约束

- 现有架构背景：需要在现有服务边界内新增适配。
- 兼容性约束：不能破坏旧接口。
- 安全性约束：不能放宽鉴权。
- 性能约束：不能明显增加延迟。
- 发布约束：仍需支持回滚。

## 候选方案对比

### 候选方案 A
- 做法：新增适配层。
- 优点：低侵入。
- 风险：治理成本上升。
- 适用条件：需要兼容旧接口。

### 候选方案 B
- 做法：直接改主链路。
- 优点：路径短。
- 风险：回滚成本高。
- 适用条件：允许更大改动。

## 选型结论

- 当前选择：新增适配层。
- 选择理由：低侵入且兼容性更好。
- 放弃其他方案的原因：主链路改动风险更高。

## 设计确认记录

- 当前轮次：4
- 最近一次确认问题：
- 最近一次用户答复摘要：
- 选型结论是否已确认：否
- 尚待确认事项：是否确认采用新增适配层

## 影响面与验证思路

- 模块影响面：接口适配层和调用链。
- 数据 / 接口影响面：不改 schema，只改调用方式。
- integration 影响面：需要联调调用方。
- 如何证明设计成立：通过回归与联调验证。
- 哪些风险需要重点验证：兼容性和回滚。
`,
      "utf8"
    );

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.risks.some((item) => item.code === "UNCONFIRMED_TECHNICAL_SELECTION"));
    assert.equal(json.data.nextStep.currentPhase, "design");
    assert.ok(json.data.nextStep.requiredSections.includes("设计确认记录"));
    assert.ok(json.data.nextStep.focusQuestion.includes("请明确确认"));
    assert.ok(json.next.some((item) => item.includes("设计确认记录")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 在低复杂度路径下会直接指向 03-任务计划与执行", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-low-complexity-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/01-需求与方案.md"),
      `# 需求与方案

## 问题定义

- 当前问题：需要验证低复杂度 change 的默认主链路。

## 目标

- 目标 1：先完成需求边界收敛。

## 非目标

- 不做额外架构重构。

## 范围

- 仅覆盖一个低复杂度 change。

## 方案备选

- 方案 A：沿用四主文档。

## 当前选择

- 选择：按低复杂度路径直接进入 03。

## 澄清确认记录

- 当前轮次：4
- 最近一次确认问题：是否按低复杂度路径直接进入 03？
- 最近一次用户答复摘要：确认按低复杂度路径推进。
- 当前选择是否已确认：是
- 尚待确认事项：无

## 风险与验收口径

- 风险：旧提示可能误导到 02。
- 验收：check 直接指向 03。
`,
      "utf8"
    );

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.nextStep.step, "plan_execution");
    assert.equal(json.data.nextStep.currentPhase, "plan");
    assert.equal(json.data.nextStep.primaryAction, "补充 03-任务计划与执行.md");
    assert.equal(json.data.nextStep.primaryDoc, "03-任务计划与执行.md");
    assert.ok(json.data.nextStep.primaryGoal.includes("低复杂度路径"));
    assert.ok(!json.data.risks.some((item) => item.code === "PLACEHOLDER_TECHNICAL_DESIGN"));
    assert.ok(json.next.some((item) => item.includes("03-任务计划与执行.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 在触发独立技术设计时会优先指向 02-技术设计与选型", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-technical-design-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/01-需求与方案.md"),
      `# 需求与方案

## 问题定义

- 当前问题：需要验证独立技术设计触发条件。

## 目标

- 目标 1：先收敛技术方案。

## 非目标

- 不直接进入实现。

## 范围

- 仅覆盖一个中复杂度 change。

## 方案备选

- 方案 A：新增适配层。

## 当前选择

- 选择：先做技术设计。

## 澄清确认记录

- 当前轮次：4
- 最近一次确认问题：是否先进入独立技术设计而不是直接拆任务？
- 最近一次用户答复摘要：确认先完成技术设计。
- 当前选择是否已确认：是
- 尚待确认事项：无

## 风险与验收口径

- 风险：技术取舍未闭合会误导实现。
- 验收：check 先指向 02。
`,
      "utf8"
    );
    const technicalDesignPath = path.join(cwd, "specs/changes/risk-device-link/02-技术设计与选型.md");
    const technicalDesign = await readFile(technicalDesignPath, "utf8");
    await writeFile(
      technicalDesignPath,
      technicalDesign
        .replace("低 / 中 / 高", "中")
        .replace("如不触发独立技术设计，请在此说明原因：", "如不触发独立技术设计，请在此说明原因：不适用"),
      "utf8"
    );

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.nextStep.step, "technical_design");
    assert.equal(json.data.nextStep.currentPhase, "design");
    assert.equal(json.data.nextStep.primaryAction, "补充 02-技术设计与选型.md");
    assert.equal(json.data.nextStep.primaryDoc, "02-技术设计与选型.md");
    assert.ok(json.data.nextStep.primaryGoal.includes("复杂度为中"));
    assert.equal(json.data.nextStep.interviewRound, 1);
    assert.equal(json.data.nextStep.interviewTarget, "触发说明与设计边界");
    assert.equal(json.data.nextStep.ambiguityPercent, 100);
    assert.ok(json.data.nextStep.readinessGates.some((item) => item.name === "触发说明与设计边界" && item.status === "focus"));
    assert.ok(json.data.nextStep.focusQuestion.includes("真正要拍板的边界"));
    assert.deepEqual(json.data.nextStep.writebackSections, ["触发说明", "技术背景与约束"]);
    assert.ok(json.data.risks.some((item) => item.code === "PLACEHOLDER_TECHNICAL_DESIGN"));
    assert.ok(json.next.some((item) => item.includes("02-技术设计与选型.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status / doctor 在技术设计阶段会输出设计访谈式引导", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-doctor-design-interview-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/01-需求与方案.md"),
      `# 需求与方案

## 问题定义
- 当前问题：需要先完成技术设计。

## 目标
- 目标 1：先收敛技术方案。

## 非目标
- 本次不做 1：不直接进入实现。

## 范围
- 本次包含：仅覆盖中复杂度场景。
- 本次不包含：不扩展其他子系统。

## 方案备选
### 方案 A
- 做法：新增适配层。
- 优点：低侵入。
- 风险：接口治理复杂。

### 方案 B
- 做法：直接改主链路。
- 优点：路径短。
- 风险：回滚成本高。

## 当前选择
- 当前选择：先进入独立技术设计。
- 选择理由：需要先确认约束与边界。
- 不选其他方案的原因：实现风险尚未闭合。

## 澄清确认记录
- 当前轮次：4
- 最近一次确认问题：是否确认先进入独立技术设计？
- 最近一次用户答复摘要：确认先做技术设计，不直接进入实现。
- 当前选择是否已确认：是
- 尚待确认事项：无

## 风险与验收口径
- 关键风险：技术取舍错误会放大返工成本。
- 验收口径：status / doctor 都优先引导 02。
`,
      "utf8"
    );
    const technicalDesignPath = path.join(cwd, "specs/changes/risk-device-link/02-技术设计与选型.md");
    const technicalDesign = await readFile(technicalDesignPath, "utf8");
    await writeFile(
      technicalDesignPath,
      technicalDesign
        .replace("低 / 中 / 高", "中")
        .replace("如不触发独立技术设计，请在此说明原因：", "如不触发独立技术设计，请在此说明原因：不适用"),
      "utf8"
    );

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.equal(statusJson.data.repo.nextStepProtocol.primaryDoc, "specs/changes/risk-device-link/02-技术设计与选型.md");
    assert.equal(statusJson.data.repo.nextStepProtocol.interviewRound, 1);
    assert.equal(statusJson.data.repo.nextStepProtocol.interviewTarget, "触发说明与设计边界");
    assert.equal(statusJson.data.repo.nextStepProtocol.ambiguityPercent, 100);
    assert.ok(statusJson.data.repo.nextStepProtocol.focusQuestion.includes("真正要拍板的边界"));
    assert.deepEqual(statusJson.data.repo.nextStepProtocol.writebackSections, ["触发说明", "技术背景与约束"]);

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    assert.equal(doctorJson.data.nextStepProtocol.primaryDoc, "specs/changes/risk-device-link/02-技术设计与选型.md");
    assert.equal(doctorJson.data.nextStepProtocol.interviewRound, 1);
    assert.equal(doctorJson.data.nextStepProtocol.interviewTarget, "触发说明与设计边界");
    assert.equal(doctorJson.data.nextStepProtocol.ambiguityPercent, 100);
    assert.ok(doctorJson.data.nextStepProtocol.focusQuestion.includes("真正要拍板的边界"));
    assert.deepEqual(doctorJson.data.nextStepProtocol.writebackSections, ["触发说明", "技术背景与约束"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check 会输出当前 change 的待回写文档", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-writeback-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify({
        items: [
          {
            runtimeArtifactId: "wb-change-1",
            runtimePath: ".nfc/plans/active/wb-change-1.md",
            targetDocPath: "specs/changes/risk-device-link/status.md",
            writebackType: "status-update",
            syncState: "pending"
          }
        ]
      }, null, 2) + "\n",
      "utf8"
    );

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.changes[0].writeback.targetDocs.includes("specs/changes/risk-device-link/status.md"));
    assert.ok(json.data.nextStep.missing.includes("待回写：specs/changes/risk-device-link/status.md"));
    assert.ok(json.data.nextStep.recommendedNext.some((item) => item.value === "specs/changes/risk-device-link/status.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 可以更新阶段", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-stage-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    const result = runCli([
      "change",
      "stage",
      "risk-device-link",
      "--cwd",
      cwd,
      "--to",
      "execute",
      "--json"
    ]);

    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.change.stage, "in-progress");
    assert.equal(json.data.change.canonicalStage, "execute");
    assert.equal(json.data.nextStep.currentPhase, "execute");
    assert.equal(json.data.nextStep.governanceMode, "guided");
    assert.equal(json.data.nextStep.writebackRequired, false);
    assert.equal(typeof json.data.nextStep.updatedAt, "string");

    const meta = JSON.parse(
      await readFile(path.join(cwd, "specs/changes/risk-device-link/meta.json"), "utf8")
    );
    const currentExecution = JSON.parse(
      await readFile(path.join(cwd, ".specnfc/execution/current.json"), "utf8")
    );
    assert.equal(meta.stage, "in-progress");
    assert.equal(meta.canonicalStage, "execute");
    assert.equal(currentExecution.currentPhase, "execute");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage 支持 canonical phase 输入", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-stage-canonical-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    let result = runCli([
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

    await writeFile(
      path.join(cwd, "specs/integrations/account-risk-api/contract.md"),
      "# 对接契约\n\n## 基本信息\n- 对接标识：`account-risk-api`\n- 提供方：`risk-engine`\n- 消费方：`account-service`\n- 关联 change-id：`risk-score-upgrade`\n\n## 契约摘要\n- 接口 / service 名称：account-risk-api\n- 对接目标：输出风险评分\n- 变更类型：兼容修改\n\n## 调用约定\n| 项 | 内容 |\n|---|---|\n| 输入 | accountId |\n| 输出 | riskScore |\n| 错误码 / 异常 | RISK_TIMEOUT |\n| 超时 | 500ms |\n| 重试 | 1 次 |\n| 幂等 | 是 |\n| 鉴权 | 内网服务鉴权 |\n\n## 责任分工\n- 提供方负责：接口实现\n- 消费方负责：接入调用\n- 联调负责人：integration-lead\n- 最终裁决人：tech-lead\n\n## 依赖顺序\n1. 提供方先出契约\n2. 消费方完成接入\n3. 双方联调验收\n\n## 联调前置条件\n- [x] 条件 1\n- [x] 条件 2\n\n## 验收标准\n- [x] 验收点 1\n- [x] 验收点 2\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, "specs/integrations/account-risk-api/decisions.md"),
      "# 对接决策\n\n## 已确认决策\n- 决策 1：统一返回 riskScore\n\n## 被拒绝方案\n- 方案：同步阻塞调用\n- 拒绝原因：超时风险过高\n\n## 仍待裁决\n- 当前无\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, "specs/integrations/account-risk-api/status.md"),
      "# 对接状态\n\n## 当前状态\n- 状态：`draft`\n- 更新时间：`2026-04-08T00:00:00.000Z`\n- 当前结论：契约已确认，可进入 aligned。\n\n## 当前阻塞\n- 已清空\n\n## 已完成\n- 契约已对齐\n- 责任分工已确认\n\n## 未完成\n- 待实现 provider 代码\n- 待 consumer 接入\n\n## 下一步\n- 下一动作：推进 aligned\n- 责任方：provider / consumer\n- 验证结论：契约人工审阅通过\n",
      "utf8"
    );

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "plan", "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.integration.status, "aligned");
    assert.equal(json.data.integration.canonicalStage, "plan");
    assert.equal(json.data.nextStep.currentPhase, "plan");
    assert.equal(json.data.nextStep.governanceMode, "guided");
    assert.equal(json.data.nextStep.writebackRequired, false);
    assert.equal(typeof json.data.nextStep.updatedAt, "string");

    const meta = JSON.parse(await readFile(path.join(cwd, "specs/integrations/account-risk-api/meta.json"), "utf8"));
    assert.equal(meta.status, "aligned");
    assert.equal(meta.canonicalStage, "plan");
    assert.equal(meta.legacyStage, "aligned");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 在规格未达标时拒绝进入 in-progress", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-stage-quality-gate-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli([
      "change",
      "stage",
      "risk-device-link",
      "--cwd",
      cwd,
      "--to",
      "in-progress",
      "--json"
    ]);

    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /CHANGE_RULES_BLOCKING|规则阻断|spec\.md|proposal\.md|design\.md|plan\.md/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 在阶段输入不合法时返回结构化错误", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-stage-invalid-target-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "ship-it", "--json"]);
    assert.equal(result.status, 2);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "INVALID_ARGS");
    assert.match(json.error.message, /未识别的阶段：ship-it/);
    assert.ok(json.next.some((item) => item.includes("in-progress")));
    assert.ok(json.next.some((item) => item.includes("archive")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check / status / doctor 会读取 repo contract 中的严格治理模式", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-mode-strict-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await setRepoGovernanceMode(cwd, "strict");

    const changeResult = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(changeResult.status, 0);
    const changeJson = JSON.parse(changeResult.stdout);
    assert.equal(changeJson.data.nextStep.governanceMode, "strict");

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.equal(statusJson.data.repo.controlPlane.governanceMode, "strict");
    assert.equal(statusJson.data.repo.nextStepProtocol.governanceMode, "strict");

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    assert.equal(doctorJson.data.controlPlane.governanceMode, "strict");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 在 strict 模式下会把 project-level 缺失作为 execute gate", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-stage-project-gate-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");
    await setRepoGovernanceMode(cwd, "strict");
    await rm(path.join(cwd, "specs/project/summary.md"), { force: true });

    const result = runCli([
      "change",
      "stage",
      "risk-device-link",
      "--cwd",
      cwd,
      "--to",
      "in-progress",
      "--json"
    ]);

    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /PROJECT_DOC_MISSING|specs\/project\/summary\.md|project-level|规则阻断/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("启用 delivery 时 change stage 会同步更新交付自检阶段", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-stage-delivery-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    const result = runCli([
      "change",
      "stage",
      "risk-device-link",
      "--cwd",
      cwd,
      "--to",
      "in-progress",
      "--json"
    ]);

    assert.equal(result.status, 0);

    const deliveryChecklist = await readFile(
      path.join(cwd, "specs/changes/risk-device-link/delivery-checklist.md"),
      "utf8"
    );
    assert.match(deliveryChecklist, /- 当前阶段：`in-progress`/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change handoff 可以生成发布交接单", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-handoff-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    const result = runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.change.stage, "handoff");
    assert.ok(json.data.change.handoffSummary);
    assert.ok(json.data.change.handoffSummary.summaryLines.length > 0);
    assert.equal(json.data.change.handoffSummary.integrationRefs.length, 0);
    assert.equal(json.data.change.handoffPath, "specs/changes/risk-device-link/04-验收与交接.md");

    const handoff = await readFile(
      path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"),
      "utf8"
    );
    assert.match(handoff, /# 验收与交接/);
    assert.match(handoff, /## 验收范围/);
    assert.match(handoff, /## 交付与发布交接/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change handoff 会输出发布影响与对接摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-handoff-summary-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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
    runCli(["change", "create", "risk-score-upgrade", "--cwd", cwd, "--title", "风险评分升级", "--json"]);
    await fillChangeForExecution(cwd, "risk-score-upgrade", { integrationId: "account-risk-api" });

    const result = runCli(["change", "handoff", "risk-score-upgrade", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.ok(json.data.change.handoffSummary.integrationRefs.includes("account-risk-api"));
    assert.ok(json.data.change.handoffSummary.deliverySummary);
    assert.equal(json.data.change.handoffPath, "specs/changes/risk-score-upgrade/04-验收与交接.md");
    assert.ok(json.data.change.handoffSummary.impactLines.some((line) => line.includes("account-risk-api")));
    assert.ok(json.data.change.handoffSummary.verificationLines.some((line) => line.includes("account-risk-api")));
    assert.ok(json.data.change.handoffSummary.integrationRefs.every((item) => item.length > 0));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("启用 delivery 时 change handoff 会同步更新交付自检文件", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-handoff-delivery-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    const result = runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const deliveryChecklist = await readFile(
      path.join(cwd, "specs/changes/risk-device-link/delivery-checklist.md"),
      "utf8"
    );
    assert.match(deliveryChecklist, /- 当前阶段：`handoff`/);
    assert.match(deliveryChecklist, /- \[x\] 如需发布交接，`release-handoff\.md` 已补齐/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("合并文档模式下 change handoff 在缺少验收与交接主文档时拒绝继续", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-handoff-merged-doc-guard-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await rm(path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"), { force: true });

    const result = runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /04-验收与交接\.md/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change handoff 在验收与交接主文档未完善时拒绝继续", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-handoff-merged-acceptance-guard-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");
    await writeFile(
      path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"),
      "# 验收与交接\n\n## 验收范围\n\n- 范围 1：\n\n## 验证方式与结果\n\n- 结果 1：\n\n## 剩余风险与结论\n\n- 当前结论：\n\n## 交付与发布交接\n\n- 对外变更摘要：\n\n## 提交说明\n\n- 变更摘要：\n",
      "utf8"
    );

    const result = runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /04-验收与交接\.md/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change archive 可以归档 change", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-archive-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");
    runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "archive", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.change.stage, "archived");

    const archivedMeta = JSON.parse(
      await readFile(path.join(cwd, "specs/archive/risk-device-link/meta.json"), "utf8")
    );
    const changeIndex = JSON.parse(
      await readFile(path.join(cwd, ".specnfc/indexes/change-index.json"), "utf8")
    );
    assert.equal(archivedMeta.stage, "archived");
    assert.ok(changeIndex.items.some((item) => item.id === "risk-device-link" && item.archived === true && item.path === "specs/archive/risk-device-link"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("启用 delivery 时 change archive 会同步更新交付自检最终状态", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-archive-delivery-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");
    runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "archive", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const deliveryChecklist = await readFile(
      path.join(cwd, "specs/archive/risk-device-link/delivery-checklist.md"),
      "utf8"
    );
    assert.match(deliveryChecklist, /- 当前阶段：`archived`/);
    assert.match(deliveryChecklist, /- \[x\] 当前变更已完成交付，可进入归档/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change archive 在验收与交接结论未确认时拒绝继续", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-archive-merged-guard-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");
    runCli(["change", "handoff", "risk-device-link", "--cwd", cwd, "--json"]);

    const acceptancePath = path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md");
    const acceptance = await readFile(acceptancePath, "utf8");
    await writeFile(
      acceptancePath,
      acceptance.replace("是否允许进入 handoff / archive：是。", ""),
      "utf8"
    );

    const result = runCli(["change", "archive", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /04-验收与交接\.md|handoff \/ archive/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 在 change 不存在时返回结构化错误", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-stage-missing-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);

    const result = runCli([
      "change",
      "stage",
      "missing-change",
      "--cwd",
      cwd,
      "--to",
      "in-progress",
      "--json"
    ]);

    assert.equal(result.status, 2);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "CHANGE_NOT_FOUND");
    assert.match(json.error.message, /未找到 change：missing-change/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 在 meta.json 损坏时返回清晰的 WRITE_DENIED", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-stage-invalid-meta-json-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(path.join(cwd, "specs/changes/risk-device-link/meta.json"), "{bad json\n", "utf8");

    const result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "design", "--json"]);
    assert.equal(result.status, 3);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.match(json.error.message, /change 元信息无法解析/);
    assert.match(json.error.message, /specs\/changes\/risk-device-link\/meta\.json/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change handoff 在 change 不存在时返回结构化错误", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-handoff-missing-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "handoff", "missing-change", "--cwd", cwd, "--json"]);

    assert.equal(result.status, 2);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "CHANGE_NOT_FOUND");
    assert.match(json.error.message, /未找到 change：missing-change/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change archive 在 change 不存在时返回结构化错误", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-archive-missing-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "archive", "missing-change", "--cwd", cwd, "--json"]);

    assert.equal(result.status, 2);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "CHANGE_NOT_FOUND");
    assert.match(json.error.message, /未找到 change：missing-change/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change archive 在缺少发布交接单时拒绝归档", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-archive-guard-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["change", "archive", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.notEqual(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /release-handoff|handoff/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change create 拒绝通过符号链接写出仓库边界", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-boundary-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "specnfc-change-outside-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    await rm(path.join(cwd, "specs/changes"), { recursive: true, force: true });
    await symlink(outsideRoot, path.join(cwd, "specs/changes"));

    const result = runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 3);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.deepEqual(await readdir(outsideRoot), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("integration stage 在 meta.json 损坏时返回清晰的 WRITE_DENIED", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-stage-invalid-meta-json-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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
    await writeFile(path.join(cwd, "specs/integrations/account-risk-api/meta.json"), "{bad json\n", "utf8");

    const result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.equal(result.status, 3);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.match(json.error.message, /对接元信息无法解析/);
    assert.match(json.error.message, /specs\/integrations\/account-risk-api\/meta\.json/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("add 拒绝通过符号链接覆写仓库外文件", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-add-boundary-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "specnfc-add-outside-"));
  const outsideTarget = path.join(outsideRoot, "owned-agents.md");

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    await writeFile(outsideTarget, "SAFE\n", "utf8");
    await rm(path.join(cwd, "AGENTS.md"), { force: true });
    await symlink(outsideTarget, path.join(cwd, "AGENTS.md"));

    const result = runCli(["add", "design-api", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 3);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "WRITE_DENIED");
    assert.equal(await readFile(outsideTarget, "utf8"), "SAFE\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("doctor 能发现 handoff 阶段缺少交接单", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-handoff-risk-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    const metaPath = path.join(cwd, "specs/changes/risk-device-link/meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    meta.stage = "handoff";
    meta.legacyStage = "handoff";
    meta.canonicalStage = "accept";
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    await rm(path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"), { force: true });

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.risks.some((item) => item.code === "MISSING_ACCEPTANCE_AND_HANDOFF"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会输出 delivery 总览", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-delivery-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.changes.delivery.enabled, 1);
    assert.equal(json.data.changes.delivery.prepared, 1);
    assert.equal(json.data.changes.delivery.blocked[0].id, "risk-device-link");
    assert.equal(json.data.changes.maturity.draft, 1);
    assert.equal(json.data.changes.maturity.blocked[0].id, "risk-device-link");
    assert.equal(json.data.compliance.complianceLevel, "blocking");
    assert.ok(json.next.some((item) => item.includes("risk-device-link")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 会把 pending writeback 反映到 compliance", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-pending-writeback-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "x", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify({
        items: [
          {
            runtimeArtifactId: "wb-1",
            runtimePath: ".nfc/plans/active/wb-1.md",
            targetDocPath: "specs/changes/x/status.md",
            writebackType: "status-update",
            syncState: "pending",
            requiredSections: ["当前结论", "下一步"]
          }
        ]
      }, null, 2) + "\n",
      "utf8"
    );

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.repo.controlPlane.runtimeSyncStatus, "pending");
    assert.equal(json.data.repo.controlPlane.pendingWritebackCount, 1);
    assert.ok(json.data.repo.controlPlane.writebackTargets.includes("specs/changes/x/status.md"));
    assert.equal(json.data.repo.compliance.complianceLevel, "blocking");
    assert.ok(json.data.repo.compliance.advisoryIssues.includes("RUNTIME_WRITEBACK_PENDING"));
    assert.ok(json.data.repo.compliance.advisoryIssues.includes("RUNTIME_WRITEBACK_TARGET:specs/changes/x/status.md"));
    assert.ok(json.data.repo.compliance.writebackTargets.includes("specs/changes/x/status.md"));
    assert.equal(json.data.repo.nextStepProtocol.writebackRequired, true);
    const runtimeLinks = JSON.parse(await readFile(path.join(cwd, "specs/changes/x/runtime-links.json"), "utf8"));
    assert.equal(runtimeLinks.pendingCount, 1);
    assert.ok(runtimeLinks.targetDocs.includes("specs/changes/x/status.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status 在 pending writeback 场景会给出具体修复动作", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-writeback-next-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "x", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify({
        items: [
          {
            runtimeArtifactId: "wb-1",
            runtimePath: ".nfc/plans/active/wb-1.md",
            targetDocPath: "specs/changes/x/status.md",
            writebackType: "status-update",
            syncState: "pending",
            requiredSections: ["当前结论", "下一步"]
          }
        ]
      }, null, 2) + "\n",
      "utf8"
    );

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "attention_needed");
    assert.ok(json.data.repo.compliance.recommendedActions.some((item) => item.includes("pending-writeback.json")));
    assert.ok(json.data.next.some((item) => item.includes("pending-writeback.json")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("projection drift 与损坏 writeback queue 并存时仍保持 change 主动作并进入阻断链路", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-invalid-writeback-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      "{ invalid json }\n",
      "utf8"
    );

    const statusText = runCli(["status", "--cwd", cwd]);
    assert.equal(statusText.status, 0);
    assert.match(statusText.stdout, /运行时同步：已损坏/);

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.equal(statusJson.ok, true);
    assert.equal(statusJson.data.repo.controlPlane.projectionStatus, "drifted");
    assert.equal(statusJson.data.repo.controlPlane.runtimeSyncStatus, "invalid");
    assert.ok(statusJson.data.repo.compliance.blockingIssues.includes("RUNTIME_WRITEBACK_INVALID"));
    assert.equal(statusJson.data.repo.nextStepProtocol.primaryAction, "specnfc change check risk-device-link");
    assert.ok(statusJson.data.repo.nextStepProtocol.missing.includes("运行时写回队列已损坏"));
    assert.ok(statusJson.data.repo.compliance.recommendedActions.some((item) => item.includes("pending-writeback.json")));

    const doctorText = runCli(["doctor", "--cwd", cwd]);
    assert.equal(doctorText.status, 0);
    assert.match(doctorText.stdout, /运行时同步：已损坏/);

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    assert.equal(doctorJson.ok, true);
    assert.equal(doctorJson.data.controlPlane.projectionStatus, "drifted");
    assert.equal(doctorJson.data.controlPlane.runtimeSyncStatus, "invalid");
    assert.ok(doctorJson.data.compliance.blockingIssues.includes("RUNTIME_WRITEBACK_INVALID"));
    assert.equal(doctorJson.data.nextStepProtocol.primaryAction, "specnfc change check risk-device-link");
    assert.ok(doctorJson.data.nextStepProtocol.missing.includes("运行时写回队列已损坏"));
    assert.ok(doctorJson.data.compliance.recommendedActions.some((item) => item.includes("pending-writeback.json")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change check --json 会把 pending writeback 反映到 nextStep", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-change-check-writeback-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify({
        items: [
          {
            runtimeArtifactId: "wb-change-1",
            runtimePath: ".nfc/plans/active/wb-change-1.md",
            targetDocPath: "specs/changes/risk-device-link/status.md",
            writebackType: "status-update",
            syncState: "pending"
          }
        ]
      }, null, 2) + "\n",
      "utf8"
    );

    const result = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.action, "check");
    assert.equal(json.data.nextStep.writebackRequired, true);
    assert.ok(json.data.nextStep.missing.includes("待回写：specs/changes/risk-device-link/status.md"));
    assert.deepEqual(json.data.nextStep.recommendedNext, [{ type: "doc", value: "specs/changes/risk-device-link/status.md" }]);
    assert.equal(json.data.changes[0].writeback.count, 1);
    assert.ok(json.data.changes[0].writeback.targetDocs.includes("specs/changes/risk-device-link/status.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor --json 会输出 integration writeback target 文档", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-writeback-target-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify({
        items: [
          {
            runtimeArtifactId: "wb-int-1",
            runtimePath: ".nfc/interviews/active/wb-int-1.md",
            targetDocPath: "specs/integrations/account-risk-api/contract.md",
            writebackType: "contract-update",
            syncState: "pending"
          }
        ]
      }, null, 2) + "\n",
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.controlPlane.runtimeSyncStatus, "pending");
    assert.ok(json.data.controlPlane.writebackTargets.includes("specs/integrations/account-risk-api/contract.md"));
    assert.ok(json.data.compliance.writebackTargets.includes("specs/integrations/account-risk-api/contract.md"));
    const runtimeLinks = JSON.parse(await readFile(path.join(cwd, "specs/integrations/account-risk-api/runtime-links.json"), "utf8"));
    assert.equal(runtimeLinks.pendingCount, 1);
    assert.ok(runtimeLinks.targetDocs.includes("specs/integrations/account-risk-api/contract.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration check --json 会把 pending writeback 反映到 nextStep", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-integration-check-writeback-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify({
        items: [
          {
            runtimeArtifactId: "wb-int-1",
            runtimePath: ".nfc/interviews/active/wb-int-1.md",
            targetDocPath: "specs/integrations/account-risk-api/contract.md",
            writebackType: "contract-update",
            syncState: "pending"
          }
        ]
      }, null, 2) + "\n",
      "utf8"
    );

    const result = runCli(["integration", "check", "account-risk-api", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.action, "check");
    assert.equal(json.data.nextStep.writebackRequired, true);
    assert.ok(json.data.nextStep.missing.includes("待回写：specs/integrations/account-risk-api/contract.md"));
    assert.deepEqual(json.data.nextStep.recommendedNext, [{ type: "doc", value: "specs/integrations/account-risk-api/contract.md" }]);
    assert.equal(json.data.integrations[0].writeback.count, 1);
    assert.ok(json.data.integrations[0].writeback.targetDocs.includes("specs/integrations/account-risk-api/contract.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会输出规格缺口汇总和优先处理项", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-maturity-priority-"));

  try {
    runCli(["init", "--cwd", cwd, "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.changes.maturity.gapSummary.MISSING_REQUIREMENTS_SCOPE, 1);
    assert.equal(json.data.changes.maturity.gapSummary.MISSING_REQUIREMENTS_ACCEPTANCE, 1);
    assert.equal(json.data.changes.maturity.gapSummary.MISSING_EXECUTION_NEXT, 1);
    assert.equal(json.data.changes.maturity.priority[0].id, "risk-device-link");
    assert.ok(json.data.changes.maturity.priority[0].gaps.some((item) => item.code === "MISSING_REQUIREMENTS_SCOPE"));
    assert.ok(json.next.some((item) => item.includes("risk-device-link")));
    assert.ok(json.next.some((item) => item.includes("范围和验收口径")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("JSON output contract schema 文件已冻结关键字段", async () => {
  const schemaMap = await loadDesignSchemas([
    "error-output.schema.json",
    "add-output.schema.json",
    "bootstrap-output.schema.json",
    "init-output.schema.json",
    "version-output.schema.json",
    "explain-output.schema.json",
    "demo-output.schema.json",
    "upgrade-output.schema.json",
    "release-output.schema.json",
    "status-output.schema.json",
    "doctor-output.schema.json",
    "change-create-output.schema.json",
    "change-check-output.schema.json",
    "change-stage-output.schema.json",
    "integration-create-output.schema.json",
    "integration-check-output.schema.json",
    "integration-stage-output.schema.json"
  ]);
  const errorSchema = schemaMap["error-output.schema.json"];
  const addSchema = schemaMap["add-output.schema.json"];
  const bootstrapSchema = schemaMap["bootstrap-output.schema.json"];
  const initSchema = schemaMap["init-output.schema.json"];
  const versionSchema = schemaMap["version-output.schema.json"];
  const explainSchema = schemaMap["explain-output.schema.json"];
  const demoSchema = schemaMap["demo-output.schema.json"];
  const upgradeSchema = schemaMap["upgrade-output.schema.json"];
  const releaseSchema = schemaMap["release-output.schema.json"];
  const statusSchema = schemaMap["status-output.schema.json"];
  const doctorSchema = schemaMap["doctor-output.schema.json"];
  const changeCreateSchema = schemaMap["change-create-output.schema.json"];
  const changeCheckSchema = schemaMap["change-check-output.schema.json"];
  const changeStageSchema = schemaMap["change-stage-output.schema.json"];
  const integrationCreateSchema = schemaMap["integration-create-output.schema.json"];
  const integrationCheckSchema = schemaMap["integration-check-output.schema.json"];
  const integrationStageSchema = schemaMap["integration-stage-output.schema.json"];

  assert.equal(errorSchema.properties.ok.const, false);
  assert.ok(errorSchema.required.includes("error"));
  assert.ok(errorSchema.properties.error.required.includes("code"));
  assert.ok(errorSchema.properties.error.required.includes("message"));

  assert.equal(bootstrapSchema.title, "specnfc bootstrap script --json output");
  assert.equal(bootstrapSchema.oneOf[0].properties.ok.const, true);
  assert.ok(bootstrapSchema.oneOf[0].properties.data.required.includes("successCriteria"));
  assert.ok(bootstrapSchema.oneOf[1].properties.error.required.includes("failedStep"));
  assert.ok(bootstrapSchema.oneOf[1].properties.data.required.includes("steps"));

  assert.equal(addSchema.properties.command.const, "add");
  assert.ok(addSchema.properties.data.required.includes("addedModules"));
  assert.ok(addSchema.properties.data.required.includes("updatedFiles"));

  assert.equal(initSchema.properties.command.const, "init");
  assert.ok(initSchema.properties.data.required.includes("nextStep"));
  assert.ok(initSchema.properties.data.properties.nextStep.required.includes("step"));
  assert.ok(initSchema.properties.data.properties.nextStep.required.includes("primaryAction"));
  assert.ok(initSchema.properties.data.properties.nextStep.required.includes("stepAware"));
  assert.ok(initSchema.properties.data.properties.nextStep.required.includes("updatedAt"));

  assert.equal(versionSchema.properties.command.const, "version");
  assert.ok(versionSchema.properties.data.required.includes("specnfcVersion"));
  assert.ok(versionSchema.properties.data.required.includes("protocolVersion"));

  assert.equal(explainSchema.properties.command.const, "explain");
  assert.ok(explainSchema.properties.data.required.includes("topic"));
  assert.ok(explainSchema.properties.data.properties.modules.items.type === "string");

  assert.equal(demoSchema.properties.command.const, "demo");
  assert.equal(demoSchema.properties.data.properties.profile.const, "enterprise");
  assert.ok(demoSchema.properties.data.properties.demoChange.required.includes("stage"));

  assert.equal(upgradeSchema.properties.command.const, "upgrade");
  assert.ok(upgradeSchema.properties.data.required.includes("protocolFilesCreated"));
  assert.ok(upgradeSchema.properties.data.properties.runtimeMigration.required.includes("reportPath"));
  assert.ok(upgradeSchema.properties.data.properties.manualActions.items.required.includes("code"));

  assert.equal(releaseSchema.title, "specnfc release script --json output");
  assert.equal(releaseSchema.oneOf[0].properties.ok.const, true);
  assert.ok(releaseSchema.oneOf[0].properties.data.required.includes("version"));
  assert.ok(releaseSchema.oneOf[1].properties.error.required.includes("code"));
  assert.ok(releaseSchema.oneOf[1].properties.error.required.includes("details"));

  assert.equal(statusSchema.properties.command.const, "status");
  assert.ok(statusSchema.required.includes("data"));
  assert.ok(statusSchema.properties.data.required.includes("repo"));
  assert.ok(statusSchema.properties.data.properties.repo.properties.controlPlane.properties.projectionHealth);
  assert.ok(statusSchema.properties.data.properties.repo.properties.nextStepProtocol.required.includes("primaryAction"));
  assert.ok(statusSchema.properties.data.properties.repo.properties.nextStepProtocol.required.includes("stepAware"));

  assert.equal(doctorSchema.properties.command.const, "doctor");
  assert.ok(doctorSchema.properties.data.required.includes("controlPlane"));
  assert.ok(doctorSchema.properties.data.properties.compliance.required.includes("writebackTargets"));

  assert.equal(changeCreateSchema.properties.command.const, "change");
  assert.equal(changeCreateSchema.properties.data.properties.action.const, "create");
  assert.ok(changeCreateSchema.properties.data.properties.nextStep.required.includes("step"));
  assert.ok(changeCreateSchema.properties.data.properties.nextStep.required.includes("primaryAction"));
  assert.ok(changeCreateSchema.properties.data.properties.nextStep.required.includes("stepAware"));
  assert.ok(changeCreateSchema.properties.data.properties.nextStep.required.includes("updatedAt"));

  assert.equal(changeCheckSchema.properties.command.const, "change");
  assert.equal(changeCheckSchema.properties.data.properties.action.const, "check");
  assert.ok(changeCheckSchema.properties.data.properties.nextStep.required.includes("step"));
  assert.ok(changeCheckSchema.properties.data.properties.nextStep.required.includes("primaryAction"));
  assert.ok(changeCheckSchema.properties.data.properties.nextStep.required.includes("stepAware"));
  assert.ok(changeCheckSchema.properties.data.properties.nextStep.required.includes("writebackRequired"));

  assert.equal(changeStageSchema.properties.command.const, "change");
  assert.equal(changeStageSchema.properties.data.properties.action.const, "stage");
  assert.ok(changeStageSchema.properties.data.properties.change.required.includes("legacyStage"));

  assert.equal(integrationCreateSchema.properties.command.const, "integration");
  assert.equal(integrationCreateSchema.properties.data.properties.action.const, "create");
  assert.ok(integrationCreateSchema.properties.data.properties.nextStep.required.includes("updatedAt"));

  assert.equal(integrationCheckSchema.properties.command.const, "integration");
  assert.equal(integrationCheckSchema.properties.data.properties.action.const, "check");
  assert.ok(integrationCheckSchema.properties.data.properties.summary.required.includes("blockedIds"));
  assert.ok(integrationCheckSchema.properties.data.properties.nextStep.required.includes("writebackRequired"));

  assert.equal(integrationStageSchema.properties.command.const, "integration");
  assert.equal(integrationStageSchema.properties.data.properties.action.const, "stage");
  assert.ok(integrationStageSchema.properties.data.properties.integration.required.includes("legacyStage"));
});

test("doctor --json 会输出发布就绪度与对接依赖摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-release-readiness-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli([
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
    runCli(["change", "create", "risk-score-upgrade", "--cwd", cwd, "--title", "风险评分升级", "--json"]);
    await fillChangeForExecution(cwd, "risk-score-upgrade", { integrationId: "account-risk-api" });

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.data.controlPlane.status, "complete");
    assert.equal(json.data.controlPlane.repoContractPath, ".specnfc/contract/repo.json");
    assert.equal(json.data.controlPlane.nfcRuntimeRoot, ".nfc");
    assert.equal(json.data.compliance.complianceLevel, "blocking");
    assert.ok(json.data.compliance.blockingIssues.length >= 1);
    assert.equal(json.data.nextStepProtocol.currentPhase, "clarify");
    assert.ok(json.data.nextStepProtocol.recommendedNext.length >= 1);
    assert.equal(json.data.releaseReadiness.blockedIntegrationRefCount, 1);
    assert.ok(json.data.releaseReadiness.blockerCount >= 1);
    assert.ok(json.data.integrationDependencies.blockedIntegrationRefs.includes("account-risk-api"));
    assert.ok(json.data.integrationDependencies.changesBlockedByIntegration.includes("risk-score-upgrade"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在仅有仓级长期文档提示时保持 healthy_idle", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-repository-advisory-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(path.join(cwd, ".specnfc/README.md"), "# TODO\n\n待补充仓级入口说明。\n", "utf8");

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "healthy_idle");
    assert.equal(json.data.summary.activeChangeCount, 0);
    assert.ok((json.data.repo.repositoryAdvisories || []).length > 0);
    assert.ok(json.data.repo.repositoryAdvisories.some((item) => item.code === "REPOSITORY_DOC_PLACEHOLDER"));
    assert.ok(json.data.repo.repositoryAdvisories.some((item) => item.file === ".specnfc/README.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 在仅有仓级治理阻断时返回 attention_needed", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-governance-blocking-only-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, ".specnfc/governance/release-decisions/v9.9.99-test.json"),
      `${JSON.stringify(
        {
          recordId: "release-9999",
          releaseTag: "v9.9.99-test",
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

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.status, "attention_needed");
    assert.equal(json.data.summary.activeChangeCount, 0);
    assert.equal(json.data.repo.compliance.complianceLevel, "blocking");
    assert.ok(json.data.repo.compliance.blockingIssues.includes("GOVERNANCE_INVALID:1"));
    assert.equal(json.data.repo.governanceRecords.invalidCount, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status --json 会输出项目记忆摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-project-memory-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.repo.projectMemory.status, "complete");
    assert.equal(json.data.repo.projectMemory.entryIndex.status, "complete");
    assert.equal(json.data.repo.projectMemory.repositoryFacts.status, "complete");
    assert.equal(json.data.repo.projectMemory.opencode.status, "complete");
    assert.ok(json.data.repo.projectMemory.index.repository.some((item) => item.paths.includes(".specnfc/context/system.md")));
    assert.ok(json.data.repo.projectMemory.index.currentWork.some((item) => item.label === "change 需求与方案"));
    assert.equal(json.data.repo.projectMemory.coverage.repositoryFactMissingCount, 0);
    assert.equal(json.data.repo.projectMemory.coverage.repositoryFactPlaceholderCount, 0);
    assert.equal(json.data.summary.projectMemoryAdvisoryCount, 0);
    assert.equal(json.data.summary.projectIndexAdvisoryCount, 1);
    assert.equal(json.data.repo.projectIndex.status, "partial");
    assert.ok(json.data.repo.projectIndex.advisories.some((item) => item.code === "PROJECT_SUMMARY_PLACEHOLDER"));
    assert.ok(Array.isArray(json.data.readingPath));
    assert.ok(json.data.readingPath.includes("specs/project/summary.md"));
    assert.ok(json.data.readingPath.includes(".specnfc/context/system.md"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会汇总仓级长期文档提示项", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-repository-advisory-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(path.join(cwd, ".specnfc/README.md"), "# TODO\n\n待补充仓级入口说明。\n", "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok((json.data.repositoryAdvisories || []).length > 0);
    assert.ok(json.data.repositoryAdvisories.some((item) => item.code === "REPOSITORY_DOC_PLACEHOLDER"));
    assert.ok(json.data.repositoryAdvisories.some((item) => item.file === ".specnfc/README.md"));
    assert.ok(!(json.data.risks || []).some((item) => item.code === "REPOSITORY_DOC_PLACEHOLDER"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 在仓级长期文档 advisory 场景会给出具体修复建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-repository-advisory-next-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(path.join(cwd, ".specnfc/README.md"), "# TODO\n\n待补充仓级入口说明。\n", "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("仓级长期文档正式内容")));
    assert.ok(json.next.some((item) => item.includes("仓级长期文档正式内容")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会输出项目记忆 advisory，但默认不升级为风险阻断", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-project-memory-advisory-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(path.join(cwd, "AGENTS.md"), "# AGENTS\n\n这里故意去掉项目记忆索引。\n", "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.projectMemory.status, "partial");
    assert.ok(json.data.projectMemory.advisories.some((item) => item.code === "PROJECT_MEMORY_INDEX_MISSING"));
    assert.ok(json.data.projectMemory.advisories.some((item) => item.file === "AGENTS.md"));
    assert.equal(json.data.projectMemory.coverage.entryFileDriftCount, 1);
    assert.ok(!(json.data.risks || []).some((item) => item.code === "PROJECT_MEMORY_INDEX_MISSING"));
    assert.ok(json.next.some((item) => item.includes("项目记忆索引")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 在项目记忆 advisory 场景会给出具体修复建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-project-memory-advisory-next-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(path.join(cwd, "AGENTS.md"), "# AGENTS\n\n这里故意去掉项目记忆索引。\n", "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("入口索引")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("项目长期事实文档")));
    assert.ok(json.next.some((item) => item.includes("项目记忆索引")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会输出 project-index 缺失提示，但在 Step 2 默认只作为 advisory", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-project-index-advisory-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await rm(path.join(cwd, ".specnfc/indexes/project-index.json"), { force: true });

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.projectIndex.status, "partial");
    assert.ok(json.data.projectIndex.advisories.some((item) => item.code === "PROJECT_INDEX_MISSING"));
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("PROJECT_INDEX_MISSING")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("project-index.json")));
    assert.ok(json.next.some((item) => item.includes("project-index.json")));
    assert.ok(!(json.data.compliance.blockingIssues || []).some((item) => item.includes("PROJECT_INDEX_MISSING")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会输出 governance registry 缺失提示并给出修复建议", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-governance-registry-missing-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await rm(path.join(cwd, ".specnfc/governance/registries/team-policy-registry.json"), { force: true });

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.governanceRegistries.status, "partial");
    assert.equal(json.data.governanceRegistries.missingCount, 1);
    assert.ok(json.data.governanceRegistries.advisories.some((item) => item.code === "GOVERNANCE_REGISTRY_MISSING"));
    assert.equal(json.data.controlPlane.checks.governanceRegistries.status, "partial");
    assert.ok(json.data.controlPlane.checks.governanceRegistries.missing.includes(".specnfc/governance/registries/team-policy-registry.json"));
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("GOVERNANCE_REGISTRY_MISSING")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes(".specnfc/governance/registries/")));
    assert.ok(json.next.some((item) => item.includes(".specnfc/governance/registries/")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 在组合异常场景下同时汇总仓级问题并保持 active change 主动作稳定", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-composite-anomalies-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--title", "设备关联风险识别增强", "--json"]);
    await writeFile(
      path.join(cwd, "AGENTS.md"),
      "# AGENTS\n\n这里故意去掉个人 Skills 兼容规则。\n",
      "utf8"
    );
    await rm(path.join(cwd, "specs/project/summary.md"), { force: true });
    await rm(path.join(cwd, ".specnfc/governance/registries/team-policy-registry.json"), { force: true });
    await writeFile(
      path.join(cwd, ".nfc/sync/pending-writeback.json"),
      JSON.stringify(
        {
          items: [
            {
              runtimeArtifactId: "wb-doctor-1",
              runtimePath: ".nfc/interviews/active/wb-doctor-1.md",
              targetDocPath: "specs/changes/risk-device-link/01-需求与方案.md",
              writebackType: "requirements-update",
              syncState: "pending"
            }
          ]
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.controlPlane.projectionStatus, "drifted");
    assert.equal(json.data.controlPlane.runtimeSyncStatus, "pending");
    assert.equal(json.data.projectIndex.status, "partial");
    assert.equal(json.data.governanceRegistries.status, "partial");
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("PROJECT_DOC_MISSING")));
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("GOVERNANCE_REGISTRY_MISSING")));
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("PROJECT_MEMORY_INDEX_MISSING")));
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("RUNTIME_WRITEBACK_PENDING")));
    assert.equal(json.data.nextStepProtocol.primaryAction, "specnfc change check risk-device-link");
    assert.equal(json.data.nextStepProtocol.primaryDoc, "specs/changes/risk-device-link/01-需求与方案.md");
    assert.equal(json.data.nextStepProtocol.writebackRequired, true);
    assert.equal(json.data.nextStepProtocol.projectionDrift, true);
    assert.equal(json.data.nextStepProtocol.interviewRound, 1);
    assert.equal(json.data.nextStepProtocol.interviewTarget, "问题定义与目标");
    assert.equal(json.data.nextStepProtocol.ambiguityPercent, 100);
    assert.ok(json.data.nextStepProtocol.readinessGates.some((item) => item.name === "问题定义与目标" && item.status === "focus"));
    assert.ok(json.data.nextStepProtocol.focusQuestion.includes("真正要解决的问题"));
    assert.deepEqual(json.data.nextStepProtocol.writebackSections, ["问题定义", "目标"]);
    assert.ok(json.next.some((item) => item.includes("AGENTS.md")));
    assert.ok(json.next.some((item) => item.includes("specs/project/summary.md")));
    assert.ok(json.next.some((item) => item.includes(".specnfc/governance/registries/")));
    assert.ok(json.next.some((item) => item.includes("补齐项目记忆索引与关键事实文档后重新运行 `specnfc doctor`")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会把初始化 project summary 占位内容汇总为 advisory", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-project-summary-placeholder-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.projectIndex.status, "partial");
    assert.ok(json.data.projectIndex.advisories.some((item) => item.code === "PROJECT_SUMMARY_PLACEHOLDER"));
    assert.ok(json.data.projectIndex.summaryContract.placeholderMarkers.includes("- 团队标识：待绑定"));
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("PROJECT_SUMMARY_PLACEHOLDER")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("specs/project/summary.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会把空白 project summary 识别为 PROJECT_SUMMARY_EMPTY", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-project-summary-empty-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(path.join(cwd, "specs/project/summary.md"), "\n", "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.projectIndex.status, "partial");
    assert.equal(json.data.projectIndex.summaryContract.status, "partial");
    assert.ok(json.data.projectIndex.advisories.some((item) => item.code === "PROJECT_SUMMARY_EMPTY"));
    assert.equal(json.data.projectIndex.summaryContract.missingSections.length, json.data.projectIndex.summaryContract.requiredSections.length);
    assert.ok(json.data.compliance.advisoryIssues.some((item) => item.includes("PROJECT_SUMMARY_EMPTY")));
    assert.ok(json.data.compliance.recommendedActions.some((item) => item.includes("specs/project/summary.md")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status 会把 project summary 缺少必填章节反映到 next-step", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-status-project-summary-section-missing-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(
      path.join(cwd, "specs/project/summary.md"),
      [
        "# 项目汇总",
        "",
        "## 项目标识",
        "- 项目 ID：demo",
        "",
        "## 协议概况",
        "- 当前仓档位：enterprise",
        "",
        "## 团队级上下文引用",
        "- 来源索引：project/catalog",
        "",
        "## 活跃 Change 摘要",
        "- 当前活跃 change：risk-device-link",
        "",
        "## 最近迭代结果",
        "- 迭代结果摘要：已完成首轮协议接入",
        "",
        "## 下一步",
        "- 推荐下一步：补齐风险分析"
      ].join("\n"),
      "utf8"
    );

    const result = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.ok(json.data.repo.projectIndex.advisories.some((item) => item.code === "PROJECT_SUMMARY_SECTION_MISSING"));
    assert.ok(json.data.repo.nextStepProtocol.missing.includes("project summary 仍是初始化占位或缺少必填章节"));
    assert.equal(json.data.repo.nextStepProtocol.primaryAction, "specnfc change create <change-id>");
    assert.ok(json.data.next.some((item) => item.includes("specnfc change create <change-id>")));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会把项目长期记忆占位内容单独汇总为 advisory", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-project-memory-placeholder-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    await writeFile(path.join(cwd, ".specnfc/context/system.md"), "# TODO\n\n待补充系统定位。\n", "utf8");

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.projectMemory.repositoryFacts.status, "partial");
    assert.equal(json.data.projectMemory.coverage.repositoryFactPlaceholderCount, 1);
    assert.ok(json.data.projectMemory.repositoryFacts.placeholders.includes(".specnfc/context/system.md"));
    assert.ok(json.data.projectMemory.advisories.some((item) => item.code === "PROJECT_MEMORY_DOC_PLACEHOLDER"));
    assert.ok(!(json.data.risks || []).some((item) => item.code === "PROJECT_MEMORY_DOC_PLACEHOLDER"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("doctor 会输出当前生效规则摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-doctor-active-rules-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);

    const result = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.runtimeRules.path, ".specnfc/runtime/active-rules.json");
    assert.ok(json.data.runtimeRules.enabledModules.includes("core"));
    assert.ok(json.data.runtimeRules.enabledModules.includes("delivery"));
    assert.ok(json.data.runtimeRules.blockingScopes.includes("change"));
    assert.ok(json.data.runtimeRules.blockingScopes.includes("integration"));
    assert.ok(json.data.runtimeRules.advisoryScopes.includes("repository"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("demo 命令可以生成完整企业示例仓", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-demo-"));

  try {
    const result = runCli(["demo", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    assert.equal(json.data.profile, "enterprise");
    assert.equal(json.data.demoChange.id, "risk-device-link");

    const config = JSON.parse(await readFile(path.join(cwd, ".specnfc/config.json"), "utf8"));
    assert.equal(config.repository.profile, "enterprise");

    const meta = JSON.parse(
      await readFile(path.join(cwd, "specs/changes/risk-device-link/meta.json"), "utf8")
    );
    assert.equal(meta.stage, "handoff");

    const requirementsAndSolution = await readFile(
      path.join(cwd, "specs/changes/risk-device-link/01-需求与方案.md"),
      "utf8"
    );
    const technicalDesign = await readFile(
      path.join(cwd, "specs/changes/risk-device-link/02-技术设计与选型.md"),
      "utf8"
    );
    const planAndExecution = await readFile(
      path.join(cwd, "specs/changes/risk-device-link/03-任务计划与执行.md"),
      "utf8"
    );
    const acceptanceAndHandoff = await readFile(
      path.join(cwd, "specs/changes/risk-device-link/04-验收与交接.md"),
      "utf8"
    );
    assert.match(requirementsAndSolution, /问题定义|方案结论/);
    assert.match(technicalDesign, /设计目标|选型结论/);
    assert.match(planAndExecution, /任务拆分|当前状态/);
    assert.match(acceptanceAndHandoff, /验收范围|交付与发布交接/);

    const claude = await readFile(path.join(cwd, "CLAUDE.md"), "utf8");
    const trae = await readFile(path.join(cwd, ".trae/rules/project_rules.md"), "utf8");
    const opencode = JSON.parse(await readFile(path.join(cwd, "opencode.json"), "utf8"));

    assert.ok(claude.includes("`.specnfc/governance/`"));
    assert.ok(trae.includes("`.specnfc/execution/`"));
    assert.ok(opencode.instructions.includes(".specnfc/quality/**/*.md"));
    assert.ok(opencode.instructions.includes(".specnfc/delivery/**/*.md"));

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    assert.equal(doctorJson.data.compliance.complianceLevel, "clean");
    assert.deepEqual(doctorJson.data.compliance.blockingIssues, []);
    assert.equal(doctorJson.data.projectIndex.status, "complete");
    assert.deepEqual(doctorJson.data.projectIndex.summaryContract.placeholderMarkers, []);

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.notEqual(statusJson.data.status, "attention_needed");
    assert.equal(statusJson.data.repo.compliance.complianceLevel, "clean");
    assert.equal(statusJson.data.repo.projectIndex.status, "complete");
    assert.deepEqual(statusJson.data.repo.projectIndex.summaryContract.placeholderMarkers, []);
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

async function fillChangeForExecution(cwd, changeId, { integrationId } = {}) {
  const changeRoot = path.join(cwd, "specs/changes", changeId);
  const integrationBlock = integrationId
    ? `\n## 关联对接\n- integration-id：\`${integrationId}\`\n- 本 change 角色：consumer\n- 本 change 职责：接入并验证\n- 依赖前置：provider 契约已 aligned\n`
    : "";

  await writeFile(
    path.join(changeRoot, "01-需求与方案.md"),
    `# 需求与方案

## 问题定义

当前链路需要补齐一条可追溯的示例 change，证明需求、方案、执行、验收可以按协议完整闭环。

## 目标

- 完成当前 change 的协议文档闭环
- 让后续阶段推进不再被占位内容阻断

## 范围

包含需求边界、方案决策、技术取舍、执行安排、验收结论与交接说明；不扩展到额外业务能力。${integrationId ? `\n${integrationBlock}` : ""}

## 方案结论

采用仓内四主文档结构推进本次 change，正式事实统一回写到 canonical dossier。

## 澄清确认记录

- 当前轮次：4
- 最近一次确认问题：是否确认以四主文档结构推进本次 change？
- 最近一次用户答复摘要：确认采用四主文档结构。
- 当前选择是否已确认：是
- 尚待确认事项：无

## 验收口径

change check 无 blocking，change stage 可推进，关键文档具备实际内容且不再是占位模板。
`,
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "02-技术设计与选型.md"),
    `# 技术设计与选型

## 设计目标

保证四主文档结构下的状态推进、摘要读取和交付判断都可以直接工作。

## 约束

兼容已有索引与治理检查；不依赖额外运行时镜像；尽量保持改动面可控。

## 候选路线

### 路线一：继续依赖旧文档

实现成本低，但会持续污染 next-step 与阅读路径。

### 路线二：以四主文档为主，旧文档仅兼容读取

能兼顾新结构落地与旧仓兼容，本次采用该方案。

## 选型结论

当前采用路线二，所有新输出优先写入四主文档，legacy 仅保留兼容输入。

## 设计确认记录

- 当前轮次：4
- 最近一次确认问题：是否确认采用路线二作为最终技术方案？
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

1. 补齐需求与方案主文档
2. 补齐技术设计与选型主文档
3. 同步执行状态、风险与下一步
4. 完成验收与交接结论

## 当前状态

当前结论：本 change 已完成文档实质内容补齐，可继续推进实现阶段。

最近更新：已写入四主文档并准备执行 change stage 校验。

## 风险与验证

- 主要风险：遗留旧文档引用可能继续污染用户可见输出
- 当前验证：通过 change check / status / doctor 观察剩余缺口

## 下一步

下一步动作：进入实现阶段并执行相关验证。
`,
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "04-验收与交接.md"),
    `# 验收与交接

## 验收范围

- change 主文档内容完整
- 阶段推进所需信息齐备
- 后续交接不依赖聊天上下文

## 验证方式与结果

- change check：预期通过
- status / doctor：预期能给出一致的协议状态
- 人工复核：确认文档内容不再是初始化占位

## 剩余风险与结论

剩余风险：若仓内仍存在 legacy 分支，后续需要继续做迁移收口。

结论：当前 change 已满足继续推进条件。是否允许进入 handoff / archive：是。

## 交付与发布交接

交付重点是保持文档、索引、状态机三者一致；后续发布按规范继续补齐发布信息。

## 提交说明

提交应聚焦单一 change，说明当前主文档补齐、阶段推进和验证结果。
`,
    "utf8"
  );

  await writeFile(path.join(changeRoot, "proposal.md"), "# Proposal\n\n已完成问题定义。\n", "utf8");
  await writeFile(path.join(changeRoot, "design.md"), `# Design\n\n已完成设计。\n${integrationBlock}`, "utf8");
  await writeFile(path.join(changeRoot, "spec.md"), `# Spec\n\n已完成规格。\n${integrationBlock}`, "utf8");
  await writeFile(path.join(changeRoot, "capabilities.md"), "# Capabilities\n\n已完成能力影响分析。\n", "utf8");
  await writeFile(path.join(changeRoot, "spec-deltas.md"), "# Spec Deltas\n\n已完成规格增量说明。\n", "utf8");
  await writeFile(path.join(changeRoot, "plan.md"), `# Plan\n\n已完成实现计划。\n${integrationBlock}`, "utf8");
  await writeFile(path.join(changeRoot, "decisions.md"), "# Decisions\n\n已记录关键决策。\n", "utf8");
  await writeFile(path.join(changeRoot, "status.md"), "# Status\n\n当前正在实现并验证。\n", "utf8");
  await writeFile(
    path.join(changeRoot, "acceptance.md"),
    "# 验收记录\n\n## 验收范围\n\n- 核心功能已覆盖\n\n## 验证方式\n\n- 单元测试：已执行\n- 集成测试：按需执行\n- 手工验证：已完成\n\n## 测试 / 验证结果\n\n- 结果 1：通过\n- 结果 2：通过\n\n## 剩余风险\n\n- 当前无\n\n## 结论\n\n- 是否满足当前阶段要求：是\n- 是否允许进入 accept / archive：是\n",
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "commit-message.md"),
    "# 提交说明草稿\n\n```text\nfeature: risk-score-upgrade 风险评分升级\n\nSummary:\n- 完成实现骨架\n\nRisks:\n- 当前无\n\nValidation:\n- change stage gating\n```\n",
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "delivery-checklist.md"),
    `# 交付自检\n\n## 基本信息\n\n- Change：\`${changeId}\`\n- 标题：风险评分升级\n- 类型：\`feature\`\n- 当前阶段：\`draft\`\n\n## 提交前\n\n- [x] \`proposal / design / spec / capabilities / spec-deltas / plan / tasks / decisions / status\` 已同步\n- [x] 本次提交只覆盖一个清晰意图\n- [x] 已补验证结果\n\n## 推送前\n\n- [x] 当前分支与 \`change-id\` 对应正确\n- [x] 风险与未完成项已写明\n- [x] 如需他人继续接手，已在正式文件写明\n\n## 交接前\n\n- [ ] 如需发布交接，\`release-handoff.md\` 已补齐\n- [x] 下游不需要依赖聊天记录\n\n## 归档前\n\n- [ ] 当前变更已完成交付，可进入归档\n`,
    "utf8"
  );
}

async function setRepoGovernanceMode(cwd, governanceMode) {
  const repoContractPath = path.join(cwd, ".specnfc/contract/repo.json");
  const repoContract = JSON.parse(await readFile(repoContractPath, "utf8"));
  repoContract.governanceMode = governanceMode;
  await writeFile(repoContractPath, `${JSON.stringify(repoContract, null, 2)}\n`, "utf8");
}

async function writeReadyIntegrationFiles(cwd, integrationId) {
  const integrationRoot = path.join(cwd, "specs/integrations", integrationId);

  await writeFile(
    path.join(integrationRoot, "contract.md"),
    `# 对接契约\n\n## 基本信息\n- 对接标识：\`${integrationId}\`\n- 提供方：\`risk-engine\`\n- 消费方：\`account-service\`\n- 关联 change-id：\`risk-score-upgrade\`\n\n## 契约摘要\n- 接口 / service 名称：${integrationId}\n- 对接目标：输出风险评分\n- 变更类型：兼容修改\n\n## 调用约定\n| 项 | 内容 |\n|---|---|\n| 输入 | accountId |\n| 输出 | riskScore |\n| 错误码 / 异常 | RISK_TIMEOUT |\n| 超时 | 500ms |\n| 重试 | 1 次 |\n| 幂等 | 是 |\n| 鉴权 | 内网服务鉴权 |\n\n## 责任分工\n- 提供方负责：接口实现\n- 消费方负责：接入调用\n- 联调负责人：integration-lead\n- 最终裁决人：tech-lead\n\n## 依赖顺序\n1. 提供方先出契约\n2. 消费方完成接入\n3. 双方联调验收\n\n## 联调前置条件\n- [x] 条件 1\n- [x] 条件 2\n\n## 验收标准\n- [x] 验收点 1\n- [x] 验收点 2\n`,
    "utf8"
  );
  await writeFile(
    path.join(integrationRoot, "decisions.md"),
    "# 对接决策\n\n## 已确认决策\n- 决策 1：统一返回 riskScore\n\n## 被拒绝方案\n- 方案：同步阻塞调用\n- 拒绝原因：超时风险过高\n\n## 仍待裁决\n- 当前无\n",
    "utf8"
  );
  await writeFile(
    path.join(integrationRoot, "status.md"),
    "# 对接状态\n\n## 当前状态\n- 状态：`draft`\n- 更新时间：`2026-04-08T00:00:00.000Z`\n- 当前结论：契约已确认，可进入 aligned。\n\n## 当前阻塞\n- 已清空\n\n## 已完成\n- 契约已对齐\n- 责任分工已确认\n\n## 未完成\n- 待实现 provider 代码\n- 待 consumer 接入\n\n## 下一步\n- 下一动作：推进 aligned\n- 责任方：provider / consumer\n- 验证结论：契约人工审阅通过\n",
    "utf8"
  );
}

async function fileExists(targetPath) {
  try {
    await readFile(targetPath, "utf8");
    return true;
  } catch {
    return false;
  }
}

function hash(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
