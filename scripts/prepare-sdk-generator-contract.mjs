#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_ADAPTERS = new Set(["swift", "go"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function expandRequiredOnlyOneOf(schema) {
  if (
    schema.type !== "object" ||
    !isRecord(schema.properties) ||
    !Array.isArray(schema.oneOf) ||
    schema.oneOf.length < 2 ||
    !schema.oneOf.every(
      (variant) =>
        isRecord(variant) &&
        Array.isArray(variant.required) &&
        Object.keys(variant).every((key) => key === "required"),
    )
  ) {
    return schema;
  }

  const { properties, type, additionalProperties, oneOf, ...outer } = schema;
  return {
    ...outer,
    oneOf: oneOf.map((variant) => ({
      type,
      ...(additionalProperties === undefined ? {} : { additionalProperties }),
      properties: Object.fromEntries(
        variant.required
          .filter((name) => typeof name === "string" && properties[name] !== undefined)
          .map((name) => [name, properties[name]]),
      ),
      ...variant,
    })),
  };
}

function normalizeCommon(value) {
  if (Array.isArray(value)) return value.map(normalizeCommon);
  if (!isRecord(value)) return value;

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, normalizeCommon(child)]),
  );
  if (normalized.in === "header" && normalized.name === "range") {
    normalized.name = "Range";
  }
  return expandRequiredOnlyOneOf(normalized);
}

function hydrateRequiredOnlyAllOf(document) {
  const schemas = document.components?.schemas;
  if (!isRecord(schemas)) return document;

  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!isRecord(value)) return value;

    const hydrated = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, visit(child)]),
    );
    if (!Array.isArray(hydrated.allOf)) return hydrated;

    const reference = hydrated.allOf.find(
      (variant) => isRecord(variant) && typeof variant.$ref === "string",
    )?.$ref;
    const prefix = "#/components/schemas/";
    if (typeof reference !== "string" || !reference.startsWith(prefix)) return hydrated;
    const referenced = schemas[reference.slice(prefix.length)];
    if (!isRecord(referenced) || !isRecord(referenced.properties)) return hydrated;

    return {
      ...hydrated,
      allOf: hydrated.allOf.map((variant) => {
        if (
          !isRecord(variant) ||
          !Array.isArray(variant.required) ||
          variant.required.length === 0 ||
          isRecord(variant.properties)
        ) {
          return variant;
        }
        return {
          ...variant,
          properties: Object.fromEntries(
            variant.required
              .filter((name) => typeof name === "string" && referenced.properties[name] !== undefined)
              .map((name) => [name, structuredClone(referenced.properties[name])]),
          ),
        };
      }),
    };
  }

  return visit(document);
}

function flattenUntaggedRequestUnionsForGo(value) {
  if (Array.isArray(value)) return value.map(flattenUntaggedRequestUnionsForGo);
  if (!isRecord(value)) return value;

  const flattened = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, flattenUntaggedRequestUnionsForGo(child)]),
  );
  if (
    !Array.isArray(flattened.oneOf) ||
    flattened.oneOf.length < 2 ||
    !flattened.oneOf.every(
      (variant) =>
        isRecord(variant) &&
        variant.type === "object" &&
        Array.isArray(variant.required) &&
        isRecord(variant.properties) &&
        Object.keys(variant.properties).every((name) => variant.required.includes(name)),
    )
  ) {
    return flattened;
  }

  const propertyNames = flattened.oneOf.flatMap((variant) => Object.keys(variant.properties));
  if (new Set(propertyNames).size !== propertyNames.length) return flattened;
  const { oneOf, ...outer } = flattened;
  return {
    ...outer,
    type: "object",
    additionalProperties: oneOf.every((variant) => variant.additionalProperties === false) ? false : undefined,
    properties: Object.assign({}, ...oneOf.map((variant) => variant.properties)),
  };
}

function flattenNestedResponseUnionsForGo(document) {
  const schemas = document.components?.schemas;
  if (!isRecord(schemas)) return document;
  const referencePrefix = "#/components/schemas/";

  function flatten(schema, visited = new Set()) {
    if (!isRecord(schema) || !Array.isArray(schema.oneOf)) return schema;
    return {
      ...schema,
      oneOf: schema.oneOf.flatMap((variant) => {
        if (
          !isRecord(variant) ||
          typeof variant.$ref !== "string" ||
          !variant.$ref.startsWith(referencePrefix) ||
          Object.keys(variant).some((key) => key !== "$ref") ||
          visited.has(variant.$ref)
        ) {
          return [variant];
        }
        const referenced = schemas[variant.$ref.slice(referencePrefix.length)];
        if (!isRecord(referenced) || !Array.isArray(referenced.oneOf)) return [variant];
        return flatten(referenced, new Set([...visited, variant.$ref])).oneOf;
      }),
    };
  }

  function flattenResponses(responses) {
    if (!isRecord(responses)) return;
    for (const response of Object.values(responses)) {
      if (!isRecord(response) || !isRecord(response.content)) continue;
      for (const mediaType of Object.values(response.content)) {
        if (isRecord(mediaType) && isRecord(mediaType.schema)) {
          mediaType.schema = flatten(mediaType.schema);
        }
      }
    }
  }

  if (isRecord(document.paths)) {
    for (const pathItem of Object.values(document.paths)) {
      if (!isRecord(pathItem)) continue;
      for (const operation of Object.values(pathItem)) {
        if (isRecord(operation)) flattenResponses(operation.responses);
      }
    }
  }
  flattenResponses(document.components?.responses);
  return document;
}

function normalizeOgenHints(document) {
  function canonicalizeHeaders(value) {
    if (Array.isArray(value)) return value.map(canonicalizeHeaders);
    if (!isRecord(value)) return value;
    const normalized = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, canonicalizeHeaders(child)]),
    );
    if (normalized.in === "header" && typeof normalized.name === "string") {
      normalized.name = normalized.name
        .split("-")
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
        .join("-");
    }
    return normalized;
  }

  const normalized = canonicalizeHeaders(document);
  function markPlainTextResponses(responses) {
    if (!isRecord(responses)) return;
    for (const response of Object.values(responses)) {
      const media = isRecord(response) && isRecord(response.content) ? response.content["text/plain"] : null;
      if (
        isRecord(media) &&
        isRecord(media.schema) &&
        media.schema.type === "string" &&
        media.schema.format !== "binary" &&
        media["x-ogen-raw-response"] === undefined
      ) {
        media["x-ogen-raw-response"] = true;
      }
    }
  }

  if (isRecord(normalized.paths)) {
    for (const pathItem of Object.values(normalized.paths)) {
      if (!isRecord(pathItem)) continue;
      for (const operation of Object.values(pathItem)) {
        if (isRecord(operation)) markPlainTextResponses(operation.responses);
      }
    }
  }
  markPlainTextResponses(normalized.components?.responses);
  return normalized;
}

function normalizeSwiftNullable(value) {
  if (Array.isArray(value)) return value.map(normalizeSwiftNullable);
  if (!isRecord(value)) return value;

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, normalizeSwiftNullable(child)]),
  );
  const variants = normalized.anyOf;
  if (Array.isArray(variants) && variants.length === 2) {
    const nullIndex = variants.findIndex((variant) => isRecord(variant) && variant.type === "null");
    if (nullIndex !== -1) {
      const nonNull = variants[nullIndex === 0 ? 1 : 0];
      if (isRecord(nonNull)) {
        const { anyOf: _discarded, ...outer } = normalized;
        if (typeof nonNull.$ref === "string") {
          const { $ref, ...annotations } = nonNull;
          return {
            ...outer,
            ...annotations,
            allOf: [{ $ref }],
            nullable: true,
          };
        }
        return { ...outer, ...nonNull, nullable: true };
      }
    }
  }

  if (Array.isArray(normalized.type) && normalized.type.includes("null")) {
    const nonNullTypes = normalized.type.filter((type) => type !== "null");
    return {
      ...normalized,
      type: nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes,
      nullable: true,
    };
  }
  return normalized;
}

/**
 * Produces a deterministic generator-specific view from the frozen canonical
 * contract. It never changes endpoint paths, wire names, or response meaning.
 */
export function prepareGeneratorContract(document, adapter) {
  if (!SUPPORTED_ADAPTERS.has(adapter)) {
    throw new Error(`Unsupported SDK contract adapter: ${adapter}`);
  }

  const common = normalizeCommon(structuredClone(document));
  if (adapter === "go") {
    return normalizeOgenHints(
      flattenNestedResponseUnionsForGo(flattenUntaggedRequestUnionsForGo(common)),
    );
  }

  return {
    ...normalizeSwiftNullable(hydrateRequiredOnlyAllOf(common)),
    openapi: "3.0.3",
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`Missing value for ${key ?? "argument"}.`);
    args[key.slice(2)] = value;
  }
  for (const required of ["input", "output", "adapter"]) {
    if (!args[required]) throw new Error(`Missing --${required}.`);
  }
  return {
    input: path.resolve(args.input),
    output: path.resolve(args.output),
    adapter: args.adapter,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const document = JSON.parse(await readFile(args.input, "utf8"));
  const prepared = prepareGeneratorContract(document, args.adapter);
  const json = `${JSON.stringify(prepared, null, 2)}\n`;
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, json);
  const sha256 = createHash("sha256").update(json).digest("hex");
  console.log(`Prepared ${args.adapter} SDK contract ${sha256} from ${args.input}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
