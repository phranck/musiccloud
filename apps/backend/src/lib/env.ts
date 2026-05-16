/**
 * Reads a required environment variable. Throws a descriptive error if the
 * variable is missing or empty, so misconfiguration fails fast at the call
 * site instead of producing broken URLs, silent auth failures, or
 * undefined-interpolation bugs downstream.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Define it in .env.local — manually or via pewee.`);
  }
  return value;
}

/**
 * Reads a required env var as a comma-separated list of trimmed, non-empty
 * entries. Throws when the var is missing or yields an empty list.
 */
export function requireEnvList(name: string): string[] {
  const items = requireEnv(name)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new Error(`Environment variable ${name} must contain at least one non-empty entry.`);
  }
  return items;
}
