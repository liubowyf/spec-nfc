import assert from "node:assert/strict";

export function assertMatchesSchema(schema, value, label = "value") {
  const errors = validateSchema(schema, value, label);
  if (errors.length) {
    assert.fail(`JSON schema 校验失败：\n${errors.join("\n")}`);
  }
}

function validateSchema(schema, value, currentPath) {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
    const branches = schema.oneOf.map((branch) => validateSchema(branch, value, currentPath));
    const passed = branches.find((errors) => errors.length === 0);
    if (passed) {
      return [];
    }
    return [`${currentPath}: 不满足 any oneOf 分支`, ...branches.flat().map((item) => `  ${item}`)];
  }

  const errors = [];

  if ("const" in schema && value !== schema.const) {
    errors.push(`${currentPath}: 期望常量 ${JSON.stringify(schema.const)}，实际为 ${JSON.stringify(value)}`);
    return errors;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matched = types.some((type) => matchesType(type, value));
    if (!matched) {
      errors.push(`${currentPath}: 期望类型 ${types.join("|")}，实际为 ${describeValueType(value)}`);
      return errors;
    }
  }

  if (Array.isArray(schema.required) && isPlainObject(value)) {
    for (const requiredKey of schema.required) {
      if (!(requiredKey in value)) {
        errors.push(`${currentPath}: 缺少必需字段 ${requiredKey}`);
      }
    }
  }

  if (isPlainObject(value) && isPlainObject(schema.properties)) {
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (key in value) {
        errors.push(...validateSchema(propertySchema, value[key], `${currentPath}.${key}`));
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          errors.push(`${currentPath}: 不允许附加字段 ${key}`);
        }
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...validateSchema(schema.items, item, `${currentPath}[${index}]`));
    });
  }

  return errors;
}

function matchesType(type, value) {
  switch (type) {
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function describeValueType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}
