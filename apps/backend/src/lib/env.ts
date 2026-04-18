/**
 * Reads a required environment variable. Throws a descriptive error if the
 * variable is missing or empty, so misconfiguration fails fast at the call
 * site instead of producing broken URLs, silent auth failures, or
 * undefined-interpolation bugs downstream.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
