import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertMatchesSchema } from "./json-schema-lite.mjs";

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function getProjectRoot() {
  return PROJECT_ROOT;
}

export function getDesignSchemaPath(schemaFileName, { root = PROJECT_ROOT } = {}) {
  return path.join(root, ".specnfc", "design", schemaFileName);
}

export async function loadDesignSchema(schemaFileName, options = {}) {
  const targetPath = getDesignSchemaPath(schemaFileName, options);
  return JSON.parse(await readFile(targetPath, "utf8"));
}

export async function loadDesignSchemas(schemaFileNames, options = {}) {
  const entries = await Promise.all(
    schemaFileNames.map(async (schemaFileName) => [schemaFileName, await loadDesignSchema(schemaFileName, options)])
  );
  return Object.fromEntries(entries);
}

export async function assertDesignSchemaMatches(schemaFileName, value, { label = schemaFileName, root = PROJECT_ROOT } = {}) {
  const schema = await loadDesignSchema(schemaFileName, { root });
  assertMatchesSchema(schema, value, label);
  return schema;
}
