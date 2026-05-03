import {
  type ContentPageSummary,
  ENDPOINTS,
  type PagesBulkErrorDetail,
  type PagesBulkRequest,
  type PagesBulkResponse,
} from "@musiccloud/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import type { ApiRequestError } from "@/shared/utils/api-error";

import { buildBulkPayload } from "./diff";
import { usePagesEditor } from "./PagesEditorContext";

type SaveStatus = "idle" | "saving" | "error";

export interface UseGlobalPagesSaveResult {
  save: () => Promise<void>;
  discard: () => void;
  status: SaveStatus;
  errorDetails: PagesBulkErrorDetail[] | null;
  dirtyCount: number;
}

export function useGlobalPagesSave(): UseGlobalPagesSaveResult {
  const editor = usePagesEditor();
  const qc = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorDetails, setErrorDetails] = useState<PagesBulkErrorDetail[] | null>(null);

  const save = useCallback(async () => {
    if (editor.dirty.size() === 0) return;
    setStatus("saving");
    setErrorDetails(null);
    const body: PagesBulkRequest = buildBulkPayload({
      meta: editor.meta,
      content: editor.content,
      segments: editor.segments,
      translations: editor.translations,
      sidebar: editor.sidebar,
    });
    try {
      const json = await api.put<PagesBulkResponse>(ENDPOINTS.admin.pages.bulk, body);
      // Re-hydrate slices from server snapshot. Translations are not in
      // the bulk response yet (see plan §"Bulk-Endpoint Schema") so they
      // stay client-side; their dirty entries get cleared because their
      // initial==current after the next user-driven hydrate cycle. For
      // now we accept that translations remain dirty until a separate
      // refetch lands them.
      const pages = json.pages;
      editor.dispatch.meta({
        type: "hydrate",
        entries: pages.map((p) => ({ slug: p.slug, meta: pickMeta(p) })),
      });
      editor.dispatch.sidebar({
        type: "hydrate",
        topLevelOrder: pages
          .filter((p) => p.pageType === "segmented")
          .slice()
          .sort((a, b) => indexOfPosition(a) - indexOfPosition(b))
          .map((p) => p.slug),
      });
      qc.invalidateQueries({ queryKey: ["content-pages"] });
      setStatus("idle");
    } catch (e) {
      const apiErr = e as ApiRequestError;
      const details = (apiErr.details ?? null) as PagesBulkErrorDetail[] | null;
      setErrorDetails(details);
      setStatus("error");
    }
  }, [editor, qc]);

  const discard = useCallback(() => editor.resetAll(), [editor]);

  return { save, discard, status, errorDetails, dirtyCount: editor.dirty.groupCount() };
}

type MetaFields = Parameters<typeof buildBulkPayload>[0]["meta"]["pages"][string]["initial"];

function pickMeta(p: ContentPageSummary): MetaFields {
  return {
    title: p.title,
    slug: p.slug,
    status: p.status,
    showTitle: p.showTitle,
    titleAlignment: p.titleAlignment,
    pageType: p.pageType,
    displayMode: p.displayMode,
    overlayWidth: p.overlayWidth,
    contentCardStyle: p.contentCardStyle,
  };
}

function indexOfPosition(p: ContentPageSummary): number {
  // ContentPageSummary doesn't expose `position` directly in the shared
  // type, but the bulk response carries it (see backend response). Cast
  // through unknown to read it safely; falls back to 0 for missing.
  const v = (p as unknown as { position?: number }).position;
  return typeof v === "number" ? v : 0;
}
