#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, "public", "assembly.config.json");

const options = parseArgs(process.argv.slice(2));
const configPath = path.resolve(PROJECT_ROOT, options.config || DEFAULT_CONFIG_PATH);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const packageJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
const outputRoot = resolveOutputRoot(options.outputRoot || config.outputRoot);
const requestedTargets = options.target ? [options.target] : Object.keys(config.targets || {});
const targets = requestedTargets.map((targetName) => {
  const targetConfig = config.targets?.[targetName];
  if (!targetConfig) {
    throw createError("INVALID_TARGET", `未识别的装配目标：${targetName}`);
  }
  return [targetName, targetConfig];
});

if (options.help) {
  printHelp();
  process.exit(0);
}

const result = {
  ok: true,
  configPath: toRelative(configPath),
  outputRoot: toRelative(outputRoot),
  dryRun: options.dryRun,
  targets: {}
};

for (const [targetName, targetConfig] of targets) {
  const assemblyRoot = path.join(outputRoot, targetConfig.rootDir);
  const entryResults = [];
  const missingRequired = [];
  const missingOptional = [];

  if (!options.dryRun) {
    rmSync(assemblyRoot, { recursive: true, force: true });
    mkdirSync(assemblyRoot, { recursive: true });
  }

  for (const entry of targetConfig.entries || []) {
    const sourcePath = path.resolve(PROJECT_ROOT, entry.source);
    const destinationRelative = entry.destination || entry.source;
    const destinationPath = path.join(assemblyRoot, destinationRelative);

    if (!existsSync(sourcePath)) {
      const missingCollection = entry.required ? missingRequired : missingOptional;
      missingCollection.push(entry.source);
      entryResults.push({
        source: entry.source,
        destination: destinationRelative,
        required: Boolean(entry.required),
        status: entry.required ? "missing-required" : "missing-optional"
      });
      continue;
    }

    entryResults.push({
      source: entry.source,
      destination: destinationRelative,
      required: Boolean(entry.required),
      status: options.dryRun ? "planned" : "copied",
      type: statSync(sourcePath).isDirectory() ? "directory" : "file"
    });

    if (options.dryRun) {
      continue;
    }

    mkdirSync(path.dirname(destinationPath), { recursive: true });
    cpSync(sourcePath, destinationPath, { recursive: true });
  }

  if (missingRequired.length > 0) {
    throw createError(
      "PUBLIC_ASSEMBLY_MISSING_REQUIRED",
      `${targetName} 缺少必要公开资产：${missingRequired.join("、")}`,
      { target: targetName, missingRequired, missingOptional }
    );
  }

  const manifest = buildManifest(packageJson, targetConfig.manifest || {});
  if (!options.dryRun) {
    writeJson(path.join(assemblyRoot, "package.json"), manifest);
  }

  result.targets[targetName] = {
    root: toRelative(assemblyRoot),
    manifestPath: path.posix.join(targetConfig.rootDir, "package.json"),
    missingOptional,
    entries: entryResults,
    manifestSummary: {
      name: manifest.name,
      version: manifest.version,
      private: manifest.private ?? false,
      scriptNames: Object.keys(manifest.scripts || {}),
      hasFilesWhitelist: Array.isArray(manifest.files)
    }
  };
}

if (!options.dryRun) {
  const reportPath = path.join(outputRoot, "assembly-report.json");
  writeJson(reportPath, result);
  result.reportPath = toRelative(reportPath);
}

finish(result, options);

function buildManifest(baseManifest, overrides) {
  const manifest = {
    name: baseManifest.name,
    version: baseManifest.version,
    description: overrides.description ?? baseManifest.description,
    type: baseManifest.type,
    private: overrides.private ?? false,
    bin: baseManifest.bin,
    engines: baseManifest.engines,
    scripts: overrides.scripts ?? {},
    keywords: overrides.keywords ?? [],
    license: overrides.license,
    repository: overrides.repository,
    homepage: overrides.homepage,
    bugs: overrides.bugs
  };

  if (Array.isArray(overrides.files)) {
    manifest.files = overrides.files;
  }

  if (overrides.publishConfig) {
    manifest.publishConfig = overrides.publishConfig;
  }

  return manifest;
}

function resolveOutputRoot(candidate) {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  return path.resolve(PROJECT_ROOT, candidate);
}

function parseArgs(argv) {
  const parsed = {
    config: null,
    outputRoot: null,
    target: null,
    dryRun: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--config") {
      parsed.config = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === "--output-root") {
      parsed.outputRoot = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === "--target") {
      parsed.target = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (token === "--json") {
      parsed.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.help = true;
    }
  }

  return parsed;
}

function createError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function writeJson(targetPath, value) {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toRelative(targetPath) {
  return path.relative(PROJECT_ROOT, targetPath).split(path.sep).join("/");
}

function finish(result, options) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`公开装配结果：${options.dryRun ? "dry-run" : "已生成"}\n`);
  process.stdout.write(`输出目录：${result.outputRoot}\n`);
  for (const [targetName, targetResult] of Object.entries(result.targets)) {
    process.stdout.write(`\n[${targetName}] ${targetResult.root}\n`);
    process.stdout.write(`- manifest: ${targetResult.manifestPath}\n`);
    process.stdout.write(`- scripts: ${targetResult.manifestSummary.scriptNames.join(", ") || "无"}\n`);
    process.stdout.write(`- 缺失可选项：${targetResult.missingOptional.join("、") || "无"}\n`);
  }
  if (result.reportPath) {
    process.stdout.write(`\n报告：${result.reportPath}\n`);
  }
}

function printHelp() {
  process.stdout.write(`Spec nfc 公开装配脚本

用法：
  node ./scripts/assemble-public.mjs [--dry-run] [--json] [--target github-source|npm-publish] [--output-root <dir>]

默认会从 public/assembly.config.json 读取公开边界，并生成：
  - dist/public/github-source/
  - dist/public/npm-publish/
`);
}
