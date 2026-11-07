// Minimal JSON-Schema validator for tool arguments (no dependencies, so the web
// test suite imports it directly). Supports: type (object|string|number|integer|
// boolean|array), properties, required, additionalProperties:false, enum,
// minimum/maximum, minLength/maxLength, pattern, format:'uuid', items,
// minItems/maxItems. Returns Arabic-free machine messages the model can act on.

export type JsonSchema = {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: "uuid" | "date-time";
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateArgs(schema: JsonSchema, value: unknown, path = "args"): string[] {
  const errors: string[] = [];
  const t = schema.type;

  if (value === undefined || value === null) {
    return errors; // presence is checked by `required` of the parent
  }

  if (t === "object") {
    if (typeof value !== "object" || Array.isArray(value)) return [`${path}: expected object`];
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) {
      if (obj[r] === undefined || obj[r] === null || obj[r] === "") errors.push(`${path}.${r}: required`);
    }
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (!sub) {
        if (schema.additionalProperties === false) errors.push(`${path}.${k}: unknown property`);
        continue;
      }
      errors.push(...validateArgs(sub, v, `${path}.${k}`));
    }
    return errors;
  }

  if (t === "array") {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errors.push(...validateArgs(schema.items!, v, `${path}[${i}]`)));
    return errors;
  }

  if (t === "string") {
    if (typeof value !== "string") return [`${path}: expected string`];
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long (max ${schema.maxLength})`);
    if (schema.format === "uuid" && !UUID_RE.test(value)) errors.push(`${path}: expected uuid`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path}: expected ISO date-time`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: invalid format`);
  } else if (t === "number" || t === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) return [`${path}: expected number`];
    if (t === "integer" && !Number.isInteger(value)) errors.push(`${path}: expected integer`);
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  } else if (t === "boolean") {
    if (typeof value !== "boolean") return [`${path}: expected boolean`];
  }

  if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
    errors.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  }
  return errors;
}

/** Collect every uuid-typed value in args according to the schema (for the entity guard). */
export function collectUuids(schema: JsonSchema, value: unknown, out: string[] = []): string[] {
  if (value === undefined || value === null) return out;
  if (schema.type === "string" && schema.format === "uuid" && typeof value === "string") out.push(value.toLowerCase());
  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    for (const v of value) collectUuids(schema.items, v, out);
  }
  if (schema.type === "object" && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const sub = schema.properties?.[k];
      if (sub) collectUuids(sub, v, out);
    }
  }
  return out;
}
