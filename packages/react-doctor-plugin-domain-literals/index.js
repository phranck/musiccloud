const DISCRIMINANT_KEY_PATTERN =
  /(^|_)(type|kind|variant|status|state|mode|category|platform|locale|level|phase|step|scope|source|target|channel|priority|severity|intent|action|event|reason|permission|feature|layout|tone|theme|placement|position|direction|sort|order|visibility|access|role)s?$/i;

const ALLOWED_FILE_SEGMENTS = new Set([
  "constants",
  "const",
  "types",
  "type",
  "schemas",
  "schema",
  "contracts",
  "contract",
  "generated",
  "fixtures",
  "__fixtures__",
  "mocks",
  "__mocks__",
]);

const ALLOWED_FILENAME_PARTS = [
  ".constants.",
  ".const.",
  ".types.",
  ".type.",
  ".schema.",
  ".schemas.",
  ".contract.",
  ".contracts.",
  ".generated.",
  ".fixture.",
  ".mock.",
  ".test.",
  ".spec.",
  ".stories.",
  ".story.",
];

const ALLOWED_JSX_PROPS = new Set([
  "alt",
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-description",
  "aria-label",
  "aria-labelledby",
  "aria-live",
  "aria-owns",
  "class",
  "className",
  "data-testid",
  "href",
  "htmlFor",
  "id",
  "name",
  "placeholder",
  "rel",
  "role",
  "src",
  "target",
  "title",
  "type",
]);

const ALLOWED_LITERAL_VALUES = new Set(["", "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const COMPARISON_OPERATORS = new Set(["==", "===", "!=", "!=="]);
const PASCAL_CASE_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

function isNodeOfType(node, type) {
  return Boolean(node && typeof node === "object" && node.type === type);
}

function normalizePath(filename) {
  return String(filename ?? "").replaceAll("\\", "/");
}

function isAllowedDefinitionFile(filename) {
  const normalized = normalizePath(filename);
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (ALLOWED_FILENAME_PARTS.some((part) => basename.includes(part))) return true;
  return normalized.split("/").some((segment) => ALLOWED_FILE_SEGMENTS.has(segment.toLowerCase()));
}

function propertyName(node) {
  if (!node) return null;
  if (isNodeOfType(node, "Identifier") || isNodeOfType(node, "JSXIdentifier")) return node.name;
  if (isNodeOfType(node, "Literal") && typeof node.value === "string") return node.value;
  return null;
}

function sourceText(context, node) {
  const sourceCode = context.sourceCode ?? context.getSourceCode?.();
  return typeof sourceCode?.getText === "function" ? sourceCode.getText(node) : "";
}

function isIgnoredFile(filename) {
  const normalized = normalizePath(filename);
  return /(^|\/)(node_modules|dist|build|coverage|\.next|\.astro|generated|fixtures|__fixtures__|mocks|__mocks__)(\/|$)/.test(
    normalized,
  );
}

function unwrapExpression(node) {
  let current = node;
  while (
    isNodeOfType(current, "TSAsExpression") ||
    isNodeOfType(current, "TSSatisfiesExpression") ||
    isNodeOfType(current, "TSNonNullExpression")
  ) {
    current = current.expression;
  }
  return current;
}

function isPrimitiveLiteral(node) {
  if (!isNodeOfType(node, "Literal")) return false;
  return typeof node.value === "string" || typeof node.value === "number" || typeof node.value === "boolean";
}

function isDomainLiteralNamespace(context, node) {
  if (!node || !/\bas\s+const\b/.test(sourceText(context, node))) return false;
  const objectExpression = unwrapExpression(node);
  if (!isNodeOfType(objectExpression, "ObjectExpression") || objectExpression.properties.length === 0) return false;
  return objectExpression.properties.every((property) => {
    if (!isNodeOfType(property, "Property") || property.computed) return false;
    return isPrimitiveLiteral(unwrapExpression(property.value));
  });
}

function memberPropertyName(node) {
  if (!isNodeOfType(node, "MemberExpression")) return null;
  return propertyName(node.property);
}

function jsxOpeningName(node) {
  if (!isNodeOfType(node, "JSXOpeningElement")) return null;
  return propertyName(node.name);
}

function isIntrinsicJsxOpening(node) {
  const name = jsxOpeningName(node);
  return typeof name === "string" && /^[a-z]/.test(name);
}

function isDiscriminantKey(name) {
  return typeof name === "string" && DISCRIMINANT_KEY_PATTERN.test(name);
}

function isInlineTypeLiteral(node) {
  if (!isNodeOfType(node, "Literal")) return false;
  if (typeof node.value === "string") return !ALLOWED_LITERAL_VALUES.has(node.value);
  return typeof node.value === "number" && Number.isFinite(node.value);
}

function isConstDefinitionObject(node) {
  let current = node;
  while (current) {
    if (isNodeOfType(current, "VariableDeclaration") && current.kind === "const") return true;
    current = current.parent ?? null;
  }
  return false;
}

function isSuspiciousIdentifierExpression(node) {
  if (isNodeOfType(node, "Identifier")) return isDiscriminantKey(node.name);
  if (isNodeOfType(node, "MemberExpression")) return isDiscriminantKey(memberPropertyName(node));
  return false;
}

function reportLiteral(context, node, keyName) {
  const keyText = keyName ? ` for "${keyName}"` : "";
  context.report({
    node,
    message: `Inline type/discriminant literal${keyText}. Move the allowed values into a shared \`as const\` object and compare against that value.`,
  });
}

const noInlineDiscriminantLiterals = {
  id: "no-inline-discriminant-literals",
  title: "Inline type/discriminant literals",
  severity: "error",
  category: "Maintainability",
  recommendation:
    "Define domain values in shared `as const` objects and use those values instead of repeated inline string or number literals.",
  create: (context) => {
    const skipFile = isAllowedDefinitionFile(context.filename);

    return {
      BinaryExpression(node) {
        if (skipFile || !COMPARISON_OPERATORS.has(node.operator)) return;

        if (isSuspiciousIdentifierExpression(node.left) && isInlineTypeLiteral(node.right)) {
          reportLiteral(context, node.right, propertyName(node.left) ?? memberPropertyName(node.left));
        }

        if (isSuspiciousIdentifierExpression(node.right) && isInlineTypeLiteral(node.left)) {
          reportLiteral(context, node.left, propertyName(node.right) ?? memberPropertyName(node.right));
        }
      },

      SwitchCase(node) {
        if (skipFile || !isInlineTypeLiteral(node.test)) return;
        const switchNode = node.parent;
        if (!isNodeOfType(switchNode, "SwitchStatement")) return;
        if (!isSuspiciousIdentifierExpression(switchNode.discriminant)) return;
        reportLiteral(
          context,
          node.test,
          propertyName(switchNode.discriminant) ?? memberPropertyName(switchNode.discriminant),
        );
      },

      Property(node) {
        if (skipFile || isConstDefinitionObject(node)) return;
        const keyName = propertyName(node.key);
        if (!isDiscriminantKey(keyName) || !isInlineTypeLiteral(node.value)) return;
        reportLiteral(context, node.value, keyName);
      },

      JSXAttribute(node) {
        if (skipFile) return;
        const propName = propertyName(node.name);
        const opening = node.parent;
        if (isIntrinsicJsxOpening(opening)) return;
        if (
          !propName ||
          ALLOWED_JSX_PROPS.has(propName) ||
          propName.startsWith("aria-") ||
          propName.startsWith("data-")
        ) {
          return;
        }
        if (!isDiscriminantKey(propName)) return;

        if (
          isNodeOfType(node.value, "Literal") &&
          typeof node.value.value === "string" &&
          isInlineTypeLiteral(node.value)
        ) {
          reportLiteral(context, node.value, propName);
          return;
        }

        if (
          isNodeOfType(node.value, "JSXExpressionContainer") &&
          isNodeOfType(node.value.expression, "Literal") &&
          typeof node.value.expression.value === "string" &&
          isInlineTypeLiteral(node.value.expression)
        ) {
          reportLiteral(context, node.value.expression, propName);
        }
      },
    };
  },
};

const preferPascalCaseLiteralNamespaces = {
  id: "prefer-pascal-case-literal-namespaces",
  title: "PascalCase domain literal namespaces",
  severity: "error",
  category: "Maintainability",
  recommendation:
    "Name primitive `as const` domain literal namespaces and their members in PascalCase, e.g. `Service.BandCamp`.",
  create: (context) => {
    const skipFile = isIgnoredFile(context.filename);

    return {
      VariableDeclarator(node) {
        if (skipFile || !isNodeOfType(node.id, "Identifier") || !isDomainLiteralNamespace(context, node.init)) return;

        if (!PASCAL_CASE_PATTERN.test(node.id.name)) {
          context.report({
            node: node.id,
            message: `Domain literal namespace "${node.id.name}" must use PascalCase, e.g. \`Service\`, not screaming snake case.`,
          });
        }

        const objectExpression = unwrapExpression(node.init);
        for (const property of objectExpression.properties) {
          const keyName = propertyName(property.key);
          if (!keyName || PASCAL_CASE_PATTERN.test(keyName)) continue;
          context.report({
            node: property.key,
            message: `Domain literal member "${keyName}" must use PascalCase, e.g. \`BandCamp\`, not lower case or screaming snake case.`,
          });
        }
      },
    };
  },
};

export default {
  meta: { name: "domain-literals" },
  rules: {
    "no-inline-discriminant-literals": noInlineDiscriminantLiterals,
    "prefer-pascal-case-literal-namespaces": preferPascalCaseLiteralNamespaces,
  },
};
