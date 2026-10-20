import { createHash } from "node:crypto";
import { createReadStream, type Stats } from "node:fs";
import { lstat, mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

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

/**
 * Whether anything exists at a path. A link counts as existing, whatever it points to.
 *
 * @param location - Path to look at.
 * @returns True when `lstat` finds an entry.
 */
export async function pathExists(location: string): Promise<boolean> {
  return lstat(location).then(
    () => true,
    () => false,
  );
}

/**
 * Reads a file that only this user may access.
 * Manifests, plans and archives hold real catalog rows, so a file that others could read is refused.
 *
 * @param location - Path of an existing regular file.
 * @param denied - Builds the error to throw, so each command reports its own code.
 * @returns The file's text.
 * @throws The error `denied` builds, for a link, a shared file, a file owned by someone else or a non-file.
 */
export async function readPrivateText(location: string, denied: () => Error): Promise<string> {
  const information = await lstat(location);
  if (!isPrivateOwnedEntry(information) || !information.isFile()) throw denied();
  return readFile(location, "utf8");
}

/** One file of a directory that is published in one piece. */
export interface PrivateFile {
  name: string;
  content: string;
}

/** Publishing a directory failed. `cleanedUp` says whether the half-written directory could be removed again. */
export class PrivatePublicationError extends Error {
  /**
   * @param cleanedUp - False when files of the failed run may remain on disk.
   */
  constructor(readonly cleanedUp: boolean) {
    super(cleanedUp ? "PUBLICATION_FAILED" : "PUBLICATION_CLEANUP_FAILED");
    this.name = "PrivatePublicationError";
  }
}

/**
 * Creates a new private directory and writes its files into it, or leaves nothing behind.
 *
 * The directory must not exist, and files are created exclusively, so an earlier artifact is never overwritten.
 * Callers list the file that marks a complete publication last, so a reader that finds it can trust the rest.
 *
 * @param output - Path of the new directory.
 * @param files - Files to write, in order.
 * @throws {PrivatePublicationError} When a write fails, after removing what this run wrote.
 */
export async function publishPrivateDirectory(output: string, files: readonly PrivateFile[]): Promise<void> {
  await mkdir(output, { mode: 0o700 });
  try {
    for (const file of files) await writeFile(path.join(output, file.name), file.content, { mode: 0o600, flag: "wx" });
  } catch {
    try {
      for (const file of files) {
        await unlink(path.join(output, file.name)).catch((error: unknown) => {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        });
      }
      await rmdir(output);
    } catch {
      throw new PrivatePublicationError(false);
    }
    throw new PrivatePublicationError(true);
  }
}
