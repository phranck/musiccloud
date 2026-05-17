export type ClassNameValue = string | false | null | undefined;

export function cx(...parts: ClassNameValue[]) {
  return parts.filter(Boolean).join(" ");
}
