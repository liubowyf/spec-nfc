import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI_PATH = path.join(PROJECT_ROOT, "bin/specnfc.mjs");

const GOVERNANCE_SCHEMAS = [
  "review-record.schema.json",
  "approval-record.schema.json",
  "verification-record.schema.json",
  "waiver-record.schema.json",
  "release-decision-record.schema.json"
];

test("init 会生成 P0 治理对象 schema、发布决策目录与最小 nfc 治理骨架", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-init-"));

  try {
    const result = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(result.status, 0);

    for (const schemaName of GOVERNANCE_SCHEMAS) {
      const schemaPath = path.join(cwd, ".specnfc", "design", schemaName);
      const content = JSON.parse(await readFile(schemaPath, "utf8"));
      assert.equal(typeof content.title, "string");
      assert.equal(content.type, "object");
    }

    await assertIsDirectory(path.join(cwd, ".specnfc", "governance", "release-decisions"));

    const governanceIndex = JSON.parse(await readFile(path.join(cwd, ".nfc", "state", "governance-index.json"), "utf8"));
    assert.equal(governanceIndex.runtimeRoot, ".nfc");
    assert.equal(governanceIndex.recordCounts.review, 0);
    assert.equal(governanceIndex.recordCounts.approval, 0);
    assert.equal(governanceIndex.recordCounts.verification, 0);
    assert.equal(governanceIndex.recordCounts.waiver, 0);
    assert.equal(governanceIndex.recordCounts.releaseDecision, 0);

    const governanceEvents = await readFile(path.join(cwd, ".nfc", "logs", "governance-events.ndjson"), "utf8");
    assert.equal(governanceEvents.trim(), "");

    const runtimeLedger = JSON.parse(await readFile(path.join(cwd, ".nfc", "state", "runtime-ledger.json"), "utf8"));
    assert.equal(runtimeLedger.status, "empty");
    assert.equal(runtimeLedger.sessionTrace.currentPhase, "clarify");
    assert.equal(runtimeLedger.writeback.pendingCount, 0);
    assert.equal(runtimeLedger.stageDecisions.decisionCount, 0);
    assert.equal(runtimeLedger.evidenceRefs.totalRefs, 0);

    const runtimeEvents = await readFile(path.join(cwd, ".nfc", "logs", "runtime-events.ndjson"), "utf8");
    assert.equal(runtimeEvents.trim(), "");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change 与 integration 创建时会生成治理 evidence 承载目录", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-objects-"));

  try {
    let result = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["change", "create", "demo-governance", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    result = runCli([
      "integration",
      "create",
      "demo-integration",
      "--provider",
      "repo-a",
      "--consumers",
      "repo-b",
      "--changes",
      "demo-governance",
      "--cwd",
      cwd,
      "--json"
    ]);
    assert.equal(result.status, 0);

    for (const relativePath of [
      "specs/changes/demo-governance/evidence/reviews",
      "specs/changes/demo-governance/evidence/approvals",
      "specs/changes/demo-governance/evidence/verifications",
      "specs/integrations/demo-integration/evidence/reviews",
      "specs/integrations/demo-integration/evidence/approvals",
      "specs/integrations/demo-integration/evidence/verifications"
    ]) {
      await assertIsDirectory(path.join(cwd, relativePath));
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status / doctor 会汇总治理对象并刷新 nfc governance index", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-summary-"));

  try {
    let result = runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["change", "create", "demo-governance", "--cwd", cwd, "--json"]);
    assert.equal(result.status, 0);

    result = runCli(
      [
        "integration",
        "create",
        "demo-integration",
        "--provider",
        "repo-a",
        "--consumers",
        "repo-b",
        "--changes",
        "demo-governance",
        "--cwd",
        cwd,
        "--json"
      ]
    );
    assert.equal(result.status, 0);

    await writeJsonFile(path.join(cwd, "specs/changes/demo-governance/evidence/reviews/design-review.json"), {
      recordId: "design-review",
      scope: "change",
      targetId: "demo-governance",
      stage: "design",
      reviewType: "design",
      reviewer: "architect",
      verdict: "approved",
      summary: "设计通过",
      evidenceRefs: ["specs/changes/demo-governance/design.md"],
      createdAt: "2026-04-15T00:00:00.000Z"
    });
    await writeJsonFile(path.join(cwd, "specs/changes/demo-governance/evidence/approvals/handoff-approval.json"), {
      recordId: "handoff-approval",
      scope: "change",
      targetId: "demo-governance",
      stage: "accept",
      approvalType: "handoff",
      approver: "tech-lead",
      decision: "approved",
      reviewRecordRefs: ["design-review"],
      verificationRecordRefs: ["qa-pass"],
      createdAt: "2026-04-15T00:05:00.000Z"
    });
    await writeJsonFile(path.join(cwd, "specs/changes/demo-governance/evidence/verifications/qa-pass.json"), {
      recordId: "qa-pass",
      scope: "change",
      targetId: "demo-governance",
      stage: "verify",
      verificationType: "tests",
      executor: "qa",
      result: "passed",
      evidenceRefs: ["tests/cli.test.mjs"],
      summary: "验证通过",
      createdAt: "2026-04-15T00:10:00.000Z"
    });
    await writeJsonFile(path.join(cwd, "specs/integrations/demo-integration/evidence/reviews/contract-review.json"), {
      recordId: "contract-review",
      scope: "integration",
      targetId: "demo-integration",
      stage: "plan",
      reviewType: "integration",
      reviewer: "api-owner",
      verdict: "approved",
      summary: "接口契约通过",
      evidenceRefs: ["specs/integrations/demo-integration/contract.md"],
      createdAt: "2026-04-15T00:15:00.000Z"
    });
    await writeJsonFile(path.join(cwd, ".specnfc/governance/waivers/projection-drift.json"), {
      waiverId: "projection-drift",
      scope: "repository",
      target: ["PROJECTION_DRIFT"],
      reason: "测试治理对象索引",
      approvedBy: "team-architect",
      validUntil: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-04-15T00:20:00.000Z"
    });
    await writeJsonFile(path.join(cwd, ".specnfc/governance/release-decisions/v9.9.99-test.json"), {
      recordId: "release-9999",
      releaseTag: "v9.9.99-test",
      decision: "approved",
      approver: "release-manager",
      changeRefs: ["demo-governance"],
      integrationRefs: ["demo-integration"],
      verificationRecordRefs: ["qa-pass"],
      waiverRefs: ["projection-drift"],
      createdAt: "2026-04-15T00:25:00.000Z"
    });

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.equal(statusJson.data.repo.governanceRecords.recordCounts.review, 2);
    assert.equal(statusJson.data.repo.governanceRecords.recordCounts.approval, 1);
    assert.equal(statusJson.data.repo.governanceRecords.recordCounts.verification, 1);
    assert.equal(statusJson.data.repo.governanceRecords.recordCounts.waiver, 1);
    assert.equal(statusJson.data.repo.governanceRecords.recordCounts.releaseDecision, 1);
    assert.equal(statusJson.data.summary.governanceRecordCount, 6);

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    assert.equal(doctorJson.data.governanceRecords.recordCounts.review, 2);
    assert.equal(doctorJson.data.governanceRecords.targetSummaries.length, 2);
    assert.equal(doctorJson.data.governanceRecords.invalidCount, 0);

    const changeCheckResult = runCli(["change", "check", "demo-governance", "--cwd", cwd, "--json"]);
    assert.equal(changeCheckResult.status, 0);
    const changeCheckJson = JSON.parse(changeCheckResult.stdout);
    assert.equal(changeCheckJson.data.changes[0].governance.recordCounts.review, 1);
    assert.equal(changeCheckJson.data.changes[0].governance.recordCounts.approval, 1);
    assert.equal(changeCheckJson.data.changes[0].governance.recordCounts.verification, 1);
    assert.equal(changeCheckJson.data.changes[0].governance.gateSummary.hasApprovedApproval, true);

    const integrationCheckResult = runCli(["integration", "check", "demo-integration", "--cwd", cwd, "--json"]);
    assert.equal(integrationCheckResult.status, 0);
    const integrationCheckJson = JSON.parse(integrationCheckResult.stdout);
    assert.equal(integrationCheckJson.data.integrations[0].governance.recordCounts.review, 1);
    assert.equal(integrationCheckJson.data.integrations[0].governance.recordCounts.approval, 0);
    assert.equal(integrationCheckJson.data.integrations[0].governance.recordCounts.verification, 0);
    assert.equal(integrationCheckJson.data.integrations[0].governance.gateSummary.hasReview, true);

    const governanceIndex = JSON.parse(await readFile(path.join(cwd, ".nfc/state/governance-index.json"), "utf8"));
    assert.equal(governanceIndex.recordCounts.review, 2);
    assert.equal(governanceIndex.recordCounts.approval, 1);
    assert.equal(governanceIndex.recordCounts.verification, 1);
    assert.equal(governanceIndex.recordCounts.waiver, 1);
    assert.equal(governanceIndex.recordCounts.releaseDecision, 1);
    assert.equal(governanceIndex.targetSummaries.length, 2);

    const governanceEvents = await readFile(path.join(cwd, ".nfc/logs/governance-events.ndjson"), "utf8");
    assert.match(governanceEvents, /governance-index-refreshed/);

    const runtimeLedger = JSON.parse(await readFile(path.join(cwd, ".nfc/state/runtime-ledger.json"), "utf8"));
    assert.equal(runtimeLedger.status, "tracked");
    assert.equal(runtimeLedger.sessionTrace.currentPhase, "clarify");
    assert.equal(runtimeLedger.governance.recordCounts.review, 2);
    assert.equal(runtimeLedger.governance.recordCounts.approval, 1);
    assert.equal(runtimeLedger.governance.recordCounts.releaseDecision, 1);
    assert.equal(runtimeLedger.stageDecisions.decisionCount, 2);
    assert.equal(runtimeLedger.evidenceRefs.totalRefs, 3);
    assert.equal(runtimeLedger.evidenceRefs.uniqueRefCount, 3);
    assert.equal(runtimeLedger.runtimeLinks.trackedTargetCount, 2);

    const runtimeEvents = await readFile(path.join(cwd, ".nfc/logs/runtime-events.ndjson"), "utf8");
    assert.match(runtimeEvents, /runtime-audit-refreshed/);

    const runtimeIndex = JSON.parse(await readFile(path.join(cwd, ".specnfc/indexes/runtime-index.json"), "utf8"));
    assert.equal(runtimeIndex.audit.status, "tracked");
    assert.equal(runtimeIndex.audit.decisionCount, 2);
    assert.equal(runtimeIndex.audit.evidenceRefCount, 3);
    assert.equal(runtimeIndex.audit.trackedTargetCount, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("status / doctor / change check / integration check 会输出治理无效记录细粒度摘要", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-invalid-summary-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "demo-governance", "--cwd", cwd, "--json"]);
    runCli([
      "integration",
      "create",
      "demo-integration",
      "--provider",
      "repo-a",
      "--consumers",
      "repo-b",
      "--changes",
      "demo-governance",
      "--cwd",
      cwd,
      "--json"
    ]);

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "demo-governance",
      type: "review",
      fileName: "broken-scope-review.json",
      payload: {
        recordId: "broken-scope-review",
        scope: "integration",
        targetId: "demo-governance",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "scope 故意写错",
        evidenceRefs: ["specs/changes/demo-governance/design.md"],
        createdAt: "2026-04-15T04:00:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "demo-governance",
      type: "approval",
      fileName: "broken-approval.json",
      payload: {
        recordId: "broken-approval",
        scope: "change",
        targetId: "demo-governance",
        stage: "accept",
        approvalType: "handoff",
        approver: "tech-lead",
        decision: "approved",
        reviewRecordRefs: ["missing-review"],
        verificationRecordRefs: ["missing-verification"],
        createdAt: "2026-04-15T04:05:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "demo-integration",
      type: "verification",
      fileName: "broken-target-verification.json",
      payload: {
        recordId: "broken-target-verification",
        scope: "integration",
        targetId: "other-integration",
        stage: "verify",
        verificationType: "integration",
        executor: "qa",
        result: "passed",
        evidenceRefs: ["specs/integrations/demo-integration/status.md"],
        summary: "target 故意写错",
        createdAt: "2026-04-15T04:10:00.000Z"
      }
    });

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.equal(statusJson.data.repo.governanceRecords.invalidCount, 3);
    assert.equal(statusJson.data.repo.compliance.complianceLevel, "blocking");
    assert.ok(statusJson.data.repo.compliance.blockingIssues.includes("GOVERNANCE_INVALID:3"));
    assert.deepEqual(statusJson.data.repo.governanceRecords.invalidSummary.byReason, {
      MISSING_RELATED_RECORD_REF: 1,
      SCOPE_MISMATCH: 1,
      TARGET_MISMATCH: 1
    });
    assert.deepEqual(statusJson.data.repo.governanceRecords.invalidSummary.byType, {
      approval: 1,
      review: 1,
      verification: 1
    });
    assert.equal(statusJson.data.repo.governanceRecords.targetSummaries.length, 2);

    const doctorResult = runCli(["doctor", "--cwd", cwd, "--json"]);
    assert.equal(doctorResult.status, 0);
    const doctorJson = JSON.parse(doctorResult.stdout);
    assert.equal(doctorJson.data.governanceRecords.invalidCount, 3);
    assert.equal(doctorJson.data.compliance.complianceLevel, "blocking");
    assert.ok(doctorJson.data.compliance.blockingIssues.includes("GOVERNANCE_INVALID:3"));
    assert.ok(doctorJson.data.compliance.recommendedActions.some((item) => item.includes("修复治理记录")));
    assert.deepEqual(doctorJson.data.governanceRecords.invalidSummary.byReason, {
      MISSING_RELATED_RECORD_REF: 1,
      SCOPE_MISMATCH: 1,
      TARGET_MISMATCH: 1
    });
    assert.deepEqual(doctorJson.data.governanceRecords.invalidSummary.byType, {
      approval: 1,
      review: 1,
      verification: 1
    });

    const changeCheckResult = runCli(["change", "check", "demo-governance", "--cwd", cwd, "--json"]);
    assert.equal(changeCheckResult.status, 0);
    const changeJson = JSON.parse(changeCheckResult.stdout);
    assert.equal(changeJson.data.changes[0].governance.invalidCount, 2);
    assert.deepEqual(changeJson.data.changes[0].governance.invalidSummary.byReason, {
      MISSING_RELATED_RECORD_REF: 1,
      SCOPE_MISMATCH: 1
    });
    assert.deepEqual(changeJson.data.changes[0].governance.invalidSummary.byType, {
      approval: 1,
      review: 1
    });
    assert.ok(changeJson.data.risks.some((item) => item.code === "INVALID_GOVERNANCE_RECORDS"));
    assert.ok(changeJson.data.nextStep.blocking.some((item) => item.startsWith("INVALID_GOVERNANCE_RECORDS：")));
    assert.ok(changeJson.data.nextStep.recommendedNext.some((item) => item.value === "specnfc doctor --json"));
    assert.equal(changeJson.data.nextStep.primaryAction, "specnfc doctor --json");
    assert.ok(changeJson.next.some((item) => item.includes("specnfc doctor --json")));

    const integrationCheckResult = runCli(["integration", "check", "demo-integration", "--cwd", cwd, "--json"]);
    assert.equal(integrationCheckResult.status, 0);
    const integrationJson = JSON.parse(integrationCheckResult.stdout);
    assert.equal(integrationJson.data.integrations[0].governance.invalidCount, 1);
    assert.deepEqual(integrationJson.data.integrations[0].governance.invalidSummary.byReason, {
      TARGET_MISMATCH: 1
    });
    assert.deepEqual(integrationJson.data.integrations[0].governance.invalidSummary.byType, {
      verification: 1
    });
    assert.ok(integrationJson.data.risks.some((item) => item.code === "INVALID_GOVERNANCE_RECORDS"));
    assert.ok(integrationJson.data.nextStep.blocking.some((item) => item.startsWith("INVALID_GOVERNANCE_RECORDS：")));
    assert.ok(integrationJson.data.nextStep.recommendedNext.some((item) => item.value === "specnfc doctor --json"));
    assert.ok(integrationJson.next.some((item) => item.includes("specnfc doctor --json")));

    const governanceIndex = JSON.parse(await readFile(path.join(cwd, ".nfc/state/governance-index.json"), "utf8"));
    assert.deepEqual(governanceIndex.invalidSummary.byReason, {
      MISSING_RELATED_RECORD_REF: 1,
      SCOPE_MISMATCH: 1,
      TARGET_MISMATCH: 1
    });

    const statusHuman = runCli(["status", "--cwd", cwd]);
    assert.equal(statusHuman.status, 0);
    assert.match(statusHuman.stdout, /无效原因：/);
    assert.match(statusHuman.stdout, /scope 不匹配=1/);
    assert.match(statusHuman.stdout, /target 不匹配=1/);
    assert.match(statusHuman.stdout, /关联记录引用缺失=1/);

    const doctorHuman = runCli(["doctor", "--cwd", cwd]);
    assert.equal(doctorHuman.status, 0);
    assert.match(doctorHuman.stdout, /无效类型：/);
    assert.match(doctorHuman.stdout, /评审=1/);
    assert.match(doctorHuman.stdout, /审批=1/);
    assert.match(doctorHuman.stdout, /验证=1/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("release-decision 引用缺失的 verification / waiver 会被纳入 repo 治理无效摘要，且不计入有效发布决策", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-invalid-release-decision-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "demo-governance", "--cwd", cwd, "--json"]);

    await writeJsonFile(path.join(cwd, ".specnfc/governance/release-decisions/v9.9.99-test.json"), {
      recordId: "release-9999",
      releaseTag: "v9.9.99-test",
      decision: "approved",
      approver: "release-manager",
      changeRefs: ["demo-governance"],
      integrationRefs: [],
      verificationRecordRefs: ["missing-qa-pass"],
      waiverRefs: ["missing-waiver"],
      createdAt: "2026-04-15T04:20:00.000Z"
    });

    const statusResult = runCli(["status", "--cwd", cwd, "--json"]);
    assert.equal(statusResult.status, 0);
    const statusJson = JSON.parse(statusResult.stdout);
    assert.equal(statusJson.data.repo.governanceRecords.recordCounts.releaseDecision, 0);
    assert.equal(statusJson.data.repo.governanceRecords.invalidCount, 1);
    assert.equal(statusJson.data.repo.compliance.complianceLevel, "blocking");
    assert.ok(statusJson.data.repo.compliance.blockingIssues.includes("GOVERNANCE_INVALID:1"));
    assert.deepEqual(statusJson.data.repo.governanceRecords.invalidSummary.byReason, {
      MISSING_RELATED_RECORD_REF: 1
    });
    assert.deepEqual(statusJson.data.repo.governanceRecords.invalidSummary.byType, {
      releaseDecision: 1
    });
    assert.deepEqual(statusJson.data.repo.governanceRecords.invalidSummary.samples[0].missingVerificationRefs, ["missing-qa-pass"]);
    assert.deepEqual(statusJson.data.repo.governanceRecords.invalidSummary.samples[0].missingWaiverRefs, ["missing-waiver"]);

    const governanceIndex = JSON.parse(await readFile(path.join(cwd, ".nfc/state/governance-index.json"), "utf8"));
    assert.equal(governanceIndex.recordCounts.releaseDecision, 0);
    assert.deepEqual(governanceIndex.invalidSummary.byType, {
      releaseDecision: 1
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 进入 verifying 前缺少 review-record 会被阻断，补齐后允许推进", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-change-verifying-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    let result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "in-progress", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "verifying", "--json"]);
    assert.notEqual(result.status, 0);
    let json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /review|评审/i);

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "review",
      fileName: "design-review.json",
      payload: {
        recordId: "design-review",
        scope: "change",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "设计评审通过",
        evidenceRefs: ["specs/changes/risk-device-link/design.md"],
        createdAt: "2026-04-15T01:00:00.000Z"
      }
    });

    result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "verifying", "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.change.stage, "verifying");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 在存在无效 governance record 时拒绝进入 verifying", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-change-invalid-gate-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "review",
      fileName: "valid-review.json",
      payload: {
        recordId: "valid-review",
        scope: "change",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "有效评审",
        evidenceRefs: ["specs/changes/risk-device-link/design.md"],
        createdAt: "2026-04-15T06:40:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "review",
      fileName: "broken-review.json",
      payload: {
        recordId: "broken-review",
        scope: "integration",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "无效评审",
        evidenceRefs: ["specs/changes/risk-device-link/design.md"],
        createdAt: "2026-04-15T06:41:00.000Z"
      }
    });

    const result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "verifying", "--json"]);
    assert.notEqual(result.status, 0);
    const json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /invalid|无效|governance/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 进入 handoff 前缺少 verification / approval record 会被阻断，补齐后允许推进", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-change-handoff-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "review",
      fileName: "design-review.json",
      payload: {
        recordId: "design-review",
        scope: "change",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "设计评审通过",
        evidenceRefs: ["specs/changes/risk-device-link/design.md"],
        createdAt: "2026-04-15T01:10:00.000Z"
      }
    });

    let result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "in-progress", "--json"]);
    assert.equal(result.status, 0);
    result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "verifying", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "handoff", "--json"]);
    assert.notEqual(result.status, 0);
    let json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /verification|验证/i);

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "verification",
      fileName: "qa-pass.json",
      payload: {
        recordId: "qa-pass",
        scope: "change",
        targetId: "risk-device-link",
        stage: "verify",
        verificationType: "tests",
        executor: "qa",
        result: "passed",
        evidenceRefs: ["tests/cli.test.mjs"],
        summary: "验证通过",
        createdAt: "2026-04-15T01:20:00.000Z"
      }
    });

    result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "handoff", "--json"]);
    assert.notEqual(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /approval|审批/i);

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "approval",
      fileName: "handoff-approval.json",
      payload: {
        recordId: "handoff-approval",
        scope: "change",
        targetId: "risk-device-link",
        stage: "accept",
        approvalType: "handoff",
        approver: "tech-lead",
        decision: "approved",
        reviewRecordRefs: ["design-review"],
        verificationRecordRefs: ["qa-pass"],
        createdAt: "2026-04-15T01:30:00.000Z"
      }
    });

    result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "handoff", "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.change.stage, "handoff");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("change stage 在存在无效 governance record 时拒绝进入 handoff", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-change-invalid-handoff-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);
    await fillChangeForExecution(cwd, "risk-device-link");

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "review",
      fileName: "valid-review.json",
      payload: {
        recordId: "valid-review",
        scope: "change",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "有效评审",
        evidenceRefs: ["specs/changes/risk-device-link/design.md"],
        createdAt: "2026-04-15T07:00:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "verification",
      fileName: "qa-pass.json",
      payload: {
        recordId: "qa-pass",
        scope: "change",
        targetId: "risk-device-link",
        stage: "verify",
        verificationType: "tests",
        executor: "qa",
        result: "passed",
        evidenceRefs: ["tests/cli.test.mjs"],
        summary: "验证通过",
        createdAt: "2026-04-15T07:01:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "approval",
      fileName: "handoff-approval.json",
      payload: {
        recordId: "handoff-approval",
        scope: "change",
        targetId: "risk-device-link",
        stage: "accept",
        approvalType: "handoff",
        approver: "tech-lead",
        decision: "approved",
        reviewRecordRefs: ["valid-review"],
        verificationRecordRefs: ["qa-pass"],
        createdAt: "2026-04-15T07:02:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "review",
      fileName: "broken-review.json",
      payload: {
        recordId: "broken-review",
        scope: "integration",
        targetId: "risk-device-link",
        stage: "design",
        reviewType: "design",
        reviewer: "architect",
        verdict: "approved",
        summary: "无效评审",
        evidenceRefs: ["specs/changes/risk-device-link/design.md"],
        createdAt: "2026-04-15T07:03:00.000Z"
      }
    });

    let result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "in-progress", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["change", "stage", "risk-device-link", "--cwd", cwd, "--to", "handoff", "--json"]);
    assert.notEqual(result.status, 0);
    const json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /invalid|无效|governance/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("approval-record 引用缺失的 review / verification 时会被标记为 invalid，且不计入有效审批", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-invalid-approval-"));

  try {
    runCli(["init", "--cwd", cwd, "--profile", "enterprise", "--json"]);
    runCli(["change", "create", "risk-device-link", "--cwd", cwd, "--json"]);

    await writeGovernanceRecord(cwd, {
      scope: "change",
      targetId: "risk-device-link",
      type: "approval",
      fileName: "broken-approval.json",
      payload: {
        recordId: "broken-approval",
        scope: "change",
        targetId: "risk-device-link",
        stage: "accept",
        approvalType: "handoff",
        approver: "tech-lead",
        decision: "approved",
        reviewRecordRefs: ["missing-review"],
        verificationRecordRefs: ["missing-verification"],
        createdAt: "2026-04-15T03:00:00.000Z"
      }
    });

    const changeCheckResult = runCli(["change", "check", "risk-device-link", "--cwd", cwd, "--json"]);
    assert.equal(changeCheckResult.status, 0);
    const json = JSON.parse(changeCheckResult.stdout);
    assert.equal(json.data.changes[0].governance.recordCounts.approval, 0);
    assert.equal(json.data.changes[0].governance.invalidCount, 1);
    assert.equal(json.data.changes[0].governance.gateSummary.hasApprovedApproval, false);
    assert.equal(json.data.changes[0].governance.invalidRecords[0].reason, "MISSING_RELATED_RECORD_REF");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage 进入 implementing 前缺少 review-record 会被阻断，补齐后允许推进", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-integration-implementing-"));

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
    await writeReadyIntegrationFiles(cwd, "account-risk-api");

    let result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "implementing", "--json"]);
    assert.notEqual(result.status, 0);
    let json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /review|评审/i);

    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "review",
      fileName: "contract-review.json",
      payload: {
        recordId: "contract-review",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "plan",
        reviewType: "integration",
        reviewer: "api-owner",
        verdict: "approved",
        summary: "接口契约评审通过",
        evidenceRefs: ["specs/integrations/account-risk-api/contract.md"],
        createdAt: "2026-04-15T01:40:00.000Z"
      }
    });

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "implementing", "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.integration.status, "implementing");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage 在存在无效 governance record 时拒绝进入 implementing", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-integration-invalid-gate-"));

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
    await writeReadyIntegrationFiles(cwd, "account-risk-api");

    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "review",
      fileName: "valid-review.json",
      payload: {
        recordId: "valid-review",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "plan",
        reviewType: "integration",
        reviewer: "api-owner",
        verdict: "approved",
        summary: "有效评审",
        evidenceRefs: ["specs/integrations/account-risk-api/contract.md"],
        createdAt: "2026-04-15T06:50:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "review",
      fileName: "broken-review.json",
      payload: {
        recordId: "broken-review",
        scope: "change",
        targetId: "account-risk-api",
        stage: "plan",
        reviewType: "integration",
        reviewer: "api-owner",
        verdict: "approved",
        summary: "无效评审",
        evidenceRefs: ["specs/integrations/account-risk-api/contract.md"],
        createdAt: "2026-04-15T06:51:00.000Z"
      }
    });

    const result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "implementing", "--json"]);
    assert.notEqual(result.status, 0);
    const json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /invalid|无效|governance/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage 进入 done 前缺少 verification / approval record 会被阻断，补齐后允许推进", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-integration-done-"));

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
    await writeReadyIntegrationFiles(cwd, "account-risk-api");

    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "review",
      fileName: "contract-review.json",
      payload: {
        recordId: "contract-review",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "plan",
        reviewType: "integration",
        reviewer: "api-owner",
        verdict: "approved",
        summary: "接口契约评审通过",
        evidenceRefs: ["specs/integrations/account-risk-api/contract.md"],
        createdAt: "2026-04-15T01:50:00.000Z"
      }
    });

    let result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.equal(result.status, 0);
    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "implementing", "--json"]);
    assert.equal(result.status, 0);
    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "integrating", "--json"]);
    assert.equal(result.status, 0);

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "done", "--json"]);
    assert.notEqual(result.status, 0);
    let json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /verification|验证/i);

    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "verification",
      fileName: "integration-pass.json",
      payload: {
        recordId: "integration-pass",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "verify",
        verificationType: "integration",
        executor: "qa",
        result: "passed",
        evidenceRefs: ["specs/integrations/account-risk-api/status.md"],
        summary: "联调验证通过",
        createdAt: "2026-04-15T02:00:00.000Z"
      }
    });

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "done", "--json"]);
    assert.notEqual(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /approval|审批/i);

    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "approval",
      fileName: "integration-approval.json",
      payload: {
        recordId: "integration-approval",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "accept",
        approvalType: "integration",
        approver: "tech-lead",
        decision: "approved",
        reviewRecordRefs: ["contract-review"],
        verificationRecordRefs: ["integration-pass"],
        createdAt: "2026-04-15T02:10:00.000Z"
      }
    });

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "done", "--json"]);
    assert.equal(result.status, 0);
    json = JSON.parse(result.stdout);
    assert.equal(json.data.integration.status, "done");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("integration stage 在存在无效 governance record 时拒绝进入 done", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "specnfc-governance-integration-invalid-done-"));

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
    await writeReadyIntegrationFiles(cwd, "account-risk-api");

    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "review",
      fileName: "valid-review.json",
      payload: {
        recordId: "valid-review",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "plan",
        reviewType: "integration",
        reviewer: "api-owner",
        verdict: "approved",
        summary: "有效评审",
        evidenceRefs: ["specs/integrations/account-risk-api/contract.md"],
        createdAt: "2026-04-15T07:10:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "verification",
      fileName: "integration-pass.json",
      payload: {
        recordId: "integration-pass",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "verify",
        verificationType: "integration",
        executor: "qa",
        result: "passed",
        evidenceRefs: ["specs/integrations/account-risk-api/status.md"],
        summary: "验证通过",
        createdAt: "2026-04-15T07:11:00.000Z"
      }
    });
    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "approval",
      fileName: "integration-approval.json",
      payload: {
        recordId: "integration-approval",
        scope: "integration",
        targetId: "account-risk-api",
        stage: "accept",
        approvalType: "integration",
        approver: "tech-lead",
        decision: "approved",
        reviewRecordRefs: ["valid-review"],
        verificationRecordRefs: ["integration-pass"],
        createdAt: "2026-04-15T07:12:00.000Z"
      }
    });
    let result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "aligned", "--json"]);
    assert.equal(result.status, 0);
    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "implementing", "--json"]);
    assert.equal(result.status, 0);
    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "integrating", "--json"]);
    assert.equal(result.status, 0);

    await writeGovernanceRecord(cwd, {
      scope: "integration",
      targetId: "account-risk-api",
      type: "review",
      fileName: "broken-review.json",
      payload: {
        recordId: "broken-review",
        scope: "change",
        targetId: "account-risk-api",
        stage: "plan",
        reviewType: "integration",
        reviewer: "api-owner",
        verdict: "approved",
        summary: "无效评审",
        evidenceRefs: ["specs/integrations/account-risk-api/contract.md"],
        createdAt: "2026-04-15T07:13:00.000Z"
      }
    });

    result = runCli(["integration", "stage", "account-risk-api", "--cwd", cwd, "--to", "done", "--json"]);
    assert.notEqual(result.status, 0);
    const json = JSON.parse(result.stdout);
    assert.equal(json.error.code, "PRECONDITION_FAILED");
    assert.match(json.error.message, /invalid|无效|governance/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

function runCli(args, { cwd = PROJECT_ROOT } = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8"
  });
}

async function assertIsDirectory(targetPath) {
  const info = await stat(targetPath);
  assert.equal(info.isDirectory(), true, `${targetPath} 应为目录`);
}

async function writeJsonFile(targetPath, payload) {
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeGovernanceRecord(cwd, { scope, targetId, type, fileName, payload }) {
  const scopeRoot = scope === "change" ? "changes" : "integrations";
  const typeDir = type === "review" ? "reviews" : type === "approval" ? "approvals" : "verifications";
  await writeJsonFile(
    path.join(cwd, "specs", scopeRoot, targetId, "evidence", typeDir, fileName),
    payload
  );
}

async function fillChangeForExecution(cwd, changeId) {
  const changeRoot = path.join(cwd, "specs/changes", changeId);

  await writeFile(
    path.join(changeRoot, "01-需求与方案.md"),
    `# 需求与方案

## 问题定义

当前链路需要补齐一条可追溯的示例 change，证明需求、方案、执行、验收可以按协议完整闭环。

## 目标

- 完成当前 change 的协议文档闭环
- 让后续阶段推进不再被占位内容阻断

## 范围

包含需求边界、方案决策、技术取舍、执行安排、验收结论与交接说明；不扩展到额外业务能力。

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
  await writeFile(path.join(changeRoot, "design.md"), "# Design\n\n已完成设计。\n", "utf8");
  await writeFile(path.join(changeRoot, "spec.md"), "# Spec\n\n已完成规格。\n", "utf8");
  await writeFile(path.join(changeRoot, "capabilities.md"), "# Capabilities\n\n已完成能力影响分析。\n", "utf8");
  await writeFile(path.join(changeRoot, "spec-deltas.md"), "# Spec Deltas\n\n已完成规格增量说明。\n", "utf8");
  await writeFile(path.join(changeRoot, "plan.md"), "# Plan\n\n已完成实现计划。\n", "utf8");
  await writeFile(path.join(changeRoot, "decisions.md"), "# Decisions\n\n已记录关键决策。\n", "utf8");
  await writeFile(path.join(changeRoot, "status.md"), "# Status\n\n当前正在实现并验证。\n", "utf8");
  await writeFile(path.join(changeRoot, "tasks.md"), "# Tasks\n\n- [x] 已完成任务拆解。\n", "utf8");
  await writeFile(
    path.join(changeRoot, "acceptance.md"),
    "# 验收记录\n\n## 验收范围\n\n- 核心功能已覆盖\n\n## 验证方式\n\n- 单元测试：已执行\n\n## 测试 / 验证结果\n\n- 结果：通过\n\n## 剩余风险\n\n- 当前无\n\n## 结论\n\n- 是否满足当前阶段要求：是\n- 是否允许进入 accept / archive：是\n",
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "commit-message.md"),
    "# 提交说明草稿\n\n```text\nfeature: risk-device-link 设备关联风险识别增强\n\nSummary:\n- 完成实现骨架\n\nRisks:\n- 当前无\n\nValidation:\n- governance stage gating\n```\n",
    "utf8"
  );
  await writeFile(
    path.join(changeRoot, "delivery-checklist.md"),
    `# 交付自检\n\n## 基本信息\n\n- Change：\`${changeId}\`\n- 标题：设备关联风险识别增强\n- 类型：\`feature\`\n- 当前阶段：\`draft\`\n\n## 提交前\n\n- [x] \`proposal / design / spec / capabilities / spec-deltas / plan / tasks / decisions / status\` 已同步\n- [x] 本次提交只覆盖一个清晰意图\n- [x] 已补验证结果\n\n## 推送前\n\n- [x] 当前分支与 \`change-id\` 对应正确\n- [x] 风险与未完成项已写明\n- [x] 如需他人继续接手，已在正式文件写明\n\n## 交接前\n\n- [ ] 如需发布交接，\`release-handoff.md\` 已补齐\n- [x] 下游不需要依赖聊天记录\n\n## 归档前\n\n- [ ] 当前变更已完成交付，可进入归档\n`,
    "utf8"
  );
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
