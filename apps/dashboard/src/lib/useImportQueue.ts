/**
 * @file Sequential import queue with conflict handling (ported from
 * lmaa.space). Items are imported one at a time; a 409 pauses the queue and
 * surfaces a conflict the UI resolves via overwrite / rename / skip, any
 * other error is counted as a failure and the queue continues.
 */

import { useCallback, useState } from "react";

/** A paused queue position: the conflicting item plus everything still pending. */
export interface ImportConflict<T> {
  item: T;
  remaining: T[];
  imported: number;
}

interface UseImportQueueOptions<T> {
  /** The import mutation: called per item with the overwrite flag. */
  mutate: (
    data: T & { overwrite: boolean },
    callbacks: {
      onSuccess: () => void;
      onError: (err: unknown) => void;
    },
  ) => void;
  /** Status texts; `importSuccess` may contain an `{n}` placeholder. */
  messages: {
    importSuccess: string;
    importError: string;
  };
}

/**
 * Drives a sequential import of named items with 409-conflict resolution.
 *
 * @returns The queue driver: `processQueue(items, 0)` starts an import run;
 *   `conflict` (when set) should render a conflict dialog wired to the three
 *   `handleConflict*` resolutions; `alertMessage` carries the final status.
 */
export function useImportQueue<T extends { name: string }>({ mutate, messages }: UseImportQueueOptions<T>) {
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ImportConflict<T> | null>(null);

  const processQueue = useCallback(
    function process(queue: T[], imported: number) {
      if (queue.length === 0) {
        if (imported > 0) {
          setAlertMessage(messages.importSuccess.replace("{n}", String(imported)));
        }
        return;
      }

      const [current, ...remaining] = queue;
      mutate(
        { ...current, overwrite: false },
        {
          onSuccess: () => process(remaining, imported + 1),
          onError: (err: unknown) => {
            const status = err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 0;
            if (status === 409) {
              setConflict({ item: current, remaining, imported });
            } else {
              setAlertMessage(messages.importError);
              process(remaining, imported);
            }
          },
        },
      );
    },
    [mutate, messages],
  );

  const handleConflictOverwrite = useCallback(() => {
    if (!conflict) return;
    const { item, remaining, imported } = conflict;
    setConflict(null);
    mutate(
      { ...item, overwrite: true },
      {
        onSuccess: () => processQueue(remaining, imported + 1),
        onError: () => {
          setAlertMessage(messages.importError);
          processQueue(remaining, imported);
        },
      },
    );
  }, [conflict, mutate, processQueue, messages]);

  const handleConflictRename = useCallback(
    (newName: string) => {
      if (!conflict) return;
      const { item, remaining, imported } = conflict;
      setConflict(null);
      processQueue([{ ...item, name: newName }, ...remaining], imported);
    },
    [conflict, processQueue],
  );

  const handleConflictSkip = useCallback(() => {
    if (!conflict) return;
    const { remaining, imported } = conflict;
    setConflict(null);
    processQueue(remaining, imported);
  }, [conflict, processQueue]);

  return {
    alertMessage,
    setAlertMessage,
    conflict,
    processQueue,
    handleConflictOverwrite,
    handleConflictRename,
    handleConflictSkip,
  };
}
