import {
  ArrowsClockwiseIcon,
  FileIcon,
  ImageIcon,
  ListBulletsIcon,
  PlusCircleIcon,
  SquaresFourIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useReducer, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout, PageSplitAside, PageSplitLayout, PageSplitMain } from "@/components/ui/PageLayout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toolbar } from "@/components/ui/Toolbar";
import { useI18n } from "@/context/I18nContext";
import { useAuth } from "@/features/auth/AuthContext";
import {
  useAdminMedia,
  useDeleteMedia,
  useRenameMedia,
  useSyncMedia,
  useUploadMedia,
} from "@/features/system/hooks/useAdminMedia";
import { MediaAssetDetails } from "@/features/system/media/MediaAssetDetails";
import { MediaGridItem } from "@/features/system/media/MediaGridItem";
import { MediaTable } from "@/features/system/media/MediaTable";
import { getSegmentedStorageKey } from "@/lib/segmented-storage";
import type { MediaAsset } from "@/shared/types/media";
import { Dialog, dialogBtnDestructive, dialogBtnSecondary, dialogHeaderIconClass } from "@/shared/ui/Dialog";

type ViewMode = "list" | "grid";

interface EditorState {
  draftName: string;
  copied: boolean;
  actionError: string | null;
}

type EditorAction =
  | { type: "resetFor"; name: string }
  | { type: "setDraftName"; value: string }
  | { type: "markCopied" }
  | { type: "clearCopied" }
  | { type: "setError"; error: string | null };

const editorInitial: EditorState = { draftName: "", copied: false, actionError: null };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "resetFor":
      return { draftName: action.name, copied: false, actionError: state.actionError };
    case "setDraftName":
      return { ...state, draftName: action.value };
    case "markCopied":
      return { ...state, copied: true };
    case "clearCopied":
      return { ...state, copied: false };
    case "setError":
      return { ...state, actionError: action.error };
  }
}

export function MediaPage() {
  const { locale, messages } = useI18n();
  const { user } = useAuth();
  const mediaMessages = messages.media;
  const common = messages.common;
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editor, editorDispatch] = useReducer(editorReducer, editorInitial);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const { data: assets = [], isLoading } = useAdminMedia();
  const uploadMedia = useUploadMedia();
  const renameMedia = useRenameMedia();
  const deleteMedia = useDeleteMedia();
  const syncMedia = useSyncMedia();

  const selectedAsset = assets.find((asset) => asset.id === selectedId) ?? null;

  useEffect(() => {
    if (assets.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !assets.some((asset) => asset.id === selectedId)) {
      setSelectedId(assets[0].id);
    }
  }, [assets, selectedId]);

  useEffect(() => {
    editorDispatch({ type: "resetFor", name: selectedAsset?.displayName ?? "" });
  }, [selectedAsset]);

  useEffect(() => {
    if (!editor.copied) return;
    const timer = window.setTimeout(() => editorDispatch({ type: "clearCopied" }), 1500);
    return () => window.clearTimeout(timer);
  }, [editor.copied]);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;

    editorDispatch({ type: "setError", error: null });
    let lastUploaded: MediaAsset | null = null;

    try {
      for (const file of Array.from(files)) {
        lastUploaded = await uploadMedia.mutateAsync(file);
      }

      if (lastUploaded) {
        setSelectedId(lastUploaded.id);
      }
    } catch (error) {
      editorDispatch({
        type: "setError",
        error: error instanceof Error ? error.message : mediaMessages.uploadError,
      });
    }
  }

  function hasDraggedFiles(event: React.DragEvent<HTMLDivElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    void handleUpload(event.dataTransfer.files);
  }

  async function handleCopyUrl() {
    if (!selectedAsset) return;
    await navigator.clipboard.writeText(selectedAsset.url);
    editorDispatch({ type: "markCopied" });
  }

  async function handleSaveMeta() {
    if (!selectedAsset) return;

    const nextName = editor.draftName.trim();
    if (!nextName) return;

    const nameChanged = nextName !== selectedAsset.displayName;
    if (!nameChanged) return;

    editorDispatch({ type: "setError", error: null });

    try {
      await renameMedia.mutateAsync({ id: selectedAsset.id, displayName: nextName });
    } catch (error) {
      editorDispatch({
        type: "setError",
        error: error instanceof Error ? error.message : mediaMessages.renameError,
      });
    }
  }

  return (
    <PageLayout>
      <PageHeader title={mediaMessages.title}>
        <SegmentedControl
          value={viewMode}
          onChange={(value) => setViewMode(value as ViewMode)}
          storageKey={getSegmentedStorageKey(user?.id, "media:view")}
          options={[
            { value: "list", icon: <ListBulletsIcon weight="duotone" className="w-4 h-4" /> },
            { value: "grid", icon: <SquaresFourIcon weight="duotone" className="w-4 h-4" /> },
          ]}
        />

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={(event) => {
            void handleUpload(event.target.files);
            event.currentTarget.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => syncMedia.mutate()}
          disabled={syncMedia.isPending}
          className="flex items-center gap-2 py-1.5 px-4 border border-[var(--ds-border)] text-[var(--ds-text)] rounded-control text-sm font-medium hover:border-[var(--ds-border-strong)] transition-colors disabled:opacity-60"
        >
          <ArrowsClockwiseIcon
            weight="duotone"
            className={`w-3.5 h-3.5 ${syncMedia.isPending ? "animate-spin" : ""}`}
          />
          Sync
        </button>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMedia.isPending}
          className="flex items-center gap-2 py-1.5 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] transition-colors disabled:opacity-60"
        >
          <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
          {uploadMedia.isPending ? mediaMessages.uploading : mediaMessages.upload}
        </button>
      </PageHeader>

      {editor.actionError && <p className="text-sm text-red-500 mb-3">{editor.actionError}</p>}

      <PageBody
        className="relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {assets.length > 0 ? (
          <PageSplitLayout>
            <PageSplitMain>
              {isLoading && (
                <div
                  className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" : "space-y-2"}
                >
                  {Array.from({ length: 8 }, (_, index) => `media-sk-${index}`).map((key) => (
                    <div
                      key={key}
                      className={`bg-[var(--ds-surface)] rounded-card border border-[var(--ds-border-subtle)] animate-pulse ${viewMode === "grid" ? "aspect-[4/3]" : "h-16"}`}
                    />
                  ))}
                </div>
              )}

              {!isLoading && viewMode === "list" && (
                <div className="-mx-3 -mt-3">
                  <MediaTable assets={assets} selectedId={selectedId} onSelect={setSelectedId} />
                </div>
              )}

              {!isLoading && viewMode === "grid" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {assets.map((asset) => (
                    <MediaGridItem
                      key={asset.id}
                      asset={asset}
                      selected={asset.id === selectedId}
                      onSelect={setSelectedId}
                    />
                  ))}
                </div>
              )}
            </PageSplitMain>

            <PageSplitAside>
              <Card className="p-4 h-fit xl:sticky xl:top-[4.75rem]">
                {selectedAsset ? (
                  <MediaAssetDetails
                    asset={selectedAsset}
                    draftName={editor.draftName}
                    copied={editor.copied}
                    saving={renameMedia.isPending}
                    savingLabel={common.saving}
                    locale={locale}
                    messages={mediaMessages}
                    onDraftNameChange={(value) => editorDispatch({ type: "setDraftName", value })}
                    onSave={() => void handleSaveMeta()}
                    onRequestDelete={() => setDeleteTarget(selectedAsset)}
                    onCopyUrl={() => void handleCopyUrl()}
                  />
                ) : (
                  <ContentUnavailableView
                    icon={<FileIcon weight="duotone" aria-hidden />}
                    title={mediaMessages.detailsTitle}
                    subtitle={mediaMessages.selectPrompt}
                    className="flex-1 min-h-[22rem]"
                  />
                )}
              </Card>
            </PageSplitAside>
          </PageSplitLayout>
        ) : (
          !isLoading && (
            <ContentUnavailableView
              icon={<ImageIcon weight="duotone" aria-hidden />}
              title={mediaMessages.empty}
              subtitle={mediaMessages.emptyHint}
              className="flex-1 min-h-0"
            />
          )
        )}

        <div
          aria-hidden={!isDragActive}
          className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[1.25rem] border-2 border-dashed transition-all ${
            isDragActive
              ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] opacity-100"
              : "border-transparent bg-transparent opacity-0"
          }`}
        >
          <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)]/95 px-6 py-5 text-center shadow-lg backdrop-blur-sm">
            <PlusCircleIcon weight="duotone" className="mx-auto mb-3 h-8 w-8 text-[var(--color-primary)]" />
            <p className="text-sm font-medium text-[var(--ds-text)]">{mediaMessages.upload}</p>
            <p className="mt-1 text-xs text-[var(--ds-text-subtle)]">{mediaMessages.uploadHint}</p>
          </div>
        </div>
      </PageBody>

      <Toolbar className="mt-4 text-xs text-[var(--ds-text-subtle)]">
        <span>{mediaMessages.uploadHint}</span>
      </Toolbar>

      <Dialog
        open={deleteTarget !== null}
        title={mediaMessages.deleteTitle}
        titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
        onClose={() => setDeleteTarget(null)}
      >
        <div className="px-6 py-3">
          <p className="text-sm text-[var(--ds-text-muted)]">
            <span className="font-medium">{deleteTarget?.displayName}</span> {mediaMessages.deleteDescription}
          </p>
        </div>
        <Dialog.Footer>
          <button type="button" onClick={() => setDeleteTarget(null)} className={dialogBtnSecondary}>
            {common.cancel}
          </button>
          <button
            type="button"
            disabled={deleteMedia.isPending || !deleteTarget}
            onClick={() => {
              if (!deleteTarget) return;
              deleteMedia.mutate(deleteTarget.id, {
                onSuccess: () => {
                  if (selectedId === deleteTarget.id) {
                    setSelectedId(null);
                  }
                  setDeleteTarget(null);
                },
                onError: (error) => {
                  editorDispatch({
                    type: "setError",
                    error: error instanceof Error ? error.message : common.unknownError,
                  });
                },
              });
            }}
            className={dialogBtnDestructive}
          >
            {deleteMedia.isPending ? "\u2026" : common.delete}
          </button>
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}
