import { createHash } from "node:crypto";
import { createReadStream, type Stats } from "node:fs";

/**
 * Whether a file system entry is private to the current user.
 * A symbolic link never counts, because the entry it points to is the one that would be read or written.
 *
 * @param information - Metadata from `lstat`, which does not follow a final link.
 * @returns True when no group or other permission bit is set and this user owns the entry.
 */
export function isPrivateOwnedEntry(information: Stats): boolean {
  return !information.isSymbolicLink() && (information.mode & 0o077) === 0 && information.uid === process.getuid?.();
}

/**
 * Streams a file through SHA-256 so a large archive never has to fit in memory.
 *
 * @param location - Path of an existing regular file.
 * @returns The lowercase hexadecimal digest of the file's exact bytes.
 */
export async function fileSha256(location: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(location)) hash.update(chunk);
  return hash.digest("hex");
}
