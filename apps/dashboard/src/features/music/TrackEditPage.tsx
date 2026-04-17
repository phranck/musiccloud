import type { ServiceId } from "@musiccloud/shared";
import { ENDPOINTS, isValidServiceId, PLATFORM_CONFIG, SERVICE_DISPLAY_ORDER } from "@musiccloud/shared";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  CheckCircle as CheckCircleIcon,
  FloppyDisk as FloppyDiskIcon,
  SpinnerGap as SpinnerGapIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useReducer } from "react";
import { useNavigate, useParams } from "react-router";

import { EditorPageShell } from "@/components/ui/EditorPageShell";
import { EditorToolbarButton } from "@/components/ui/EditorToolbarButton";
import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";
import { useKeyboardSave } from "@/lib/useKeyboardSave";
import { PlatformIcon } from "@/shared/ui/PlatformIcon";

interface TrackDetail {
  id: string;
  title: string;
  artists: string[];
  albumName: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  releaseDate: string | null;
  isExplicit: boolean;
  previewUrl: string | null;
  sourceService: string | null;
  sourceUrl: string | null;
  shortId: string | null;
  createdAt: number;
  serviceLinks: { service: string; url: string }[];
}

const fieldClass =
  "w-full h-9 px-3 border border-[var(--ds-border)] rounded-control text-sm bg-[var(--ds-surface)] text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:border-[var(--color-primary)]";

const readOnlyClass =
  "w-full h-9 px-3 border border-[var(--ds-border)] rounded-control text-sm bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] cursor-default";

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

interface LoadState {
  phase: "loading" | "loaded" | "notFound";
  track: TrackDetail | null;
}
type LoadAction = { type: "loaded"; track: TrackDetail } | { type: "notFound" } | { type: "reload" };

function loadReducer(_state: LoadState, action: LoadAction): LoadState {
  switch (action.type) {
    case "loaded":
      return { phase: "loaded", track: action.track };
    case "notFound":
      return { phase: "notFound", track: null };
    case "reload":
      return { phase: "loading", track: null };
  }
}

interface FormState {
  title: string;
  artists: string;
  albumName: string;
  isrc: string;
  artworkUrl: string;
}
type FormAction = { type: "set"; field: keyof FormState; value: string } | { type: "hydrate"; form: FormState };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "set":
      return { ...state, [action.field]: action.value };
    case "hydrate":
      return action.form;
  }
}

const emptyForm: FormState = { title: "", artists: "", albumName: "", isrc: "", artworkUrl: "" };

interface SaveState {
  saving: boolean;
  saved: boolean;
  error: string | null;
}
type SaveAction = { type: "start" } | { type: "success" } | { type: "clearSaved" } | { type: "error"; error: string };

function saveReducer(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    case "start":
      return { saving: true, saved: false, error: null };
    case "success":
      return { saving: false, saved: true, error: null };
    case "clearSaved":
      return { ...state, saved: false };
    case "error":
      return { saving: false, saved: false, error: action.error };
  }
}

export function TrackEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { messages } = useI18n();
  const m = messages.music.trackEdit;
  const common = messages.common;

  const [load, loadDispatch] = useReducer(loadReducer, { phase: "loading", track: null });
  const [form, formDispatch] = useReducer(formReducer, emptyForm);
  const [save, saveDispatch] = useReducer(saveReducer, { saving: false, saved: false, error: null });

  useEffect(() => {
    if (!id) return;
    loadDispatch({ type: "reload" });
    api
      .get<TrackDetail>(ENDPOINTS.admin.tracks.detail(id))
      .then((data) => {
        loadDispatch({ type: "loaded", track: data });
        formDispatch({
          type: "hydrate",
          form: {
            title: data.title,
            artists: data.artists.join(", "),
            albumName: data.albumName ?? "",
            isrc: data.isrc ?? "",
            artworkUrl: data.artworkUrl ?? "",
          },
        });
      })
      .catch(() => loadDispatch({ type: "notFound" }));
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!id || save.saving) return;
    saveDispatch({ type: "start" });
    try {
      await api.patch(ENDPOINTS.admin.tracks.detail(id), {
        title: form.title,
        artists: form.artists.split(",").flatMap((a) => {
          const trimmed = a.trim();
          return trimmed ? [trimmed] : [];
        }),
        albumName: form.albumName || null,
        isrc: form.isrc || null,
        artworkUrl: form.artworkUrl || null,
      });
      saveDispatch({ type: "success" });
      setTimeout(() => saveDispatch({ type: "clearSaved" }), 2000);
    } catch {
      saveDispatch({ type: "error", error: m.saveError });
    }
  }, [id, save.saving, form, m.saveError]);

  useKeyboardSave(handleSave);

  function handleCancel() {
    navigate("/tracks");
  }

  if (load.phase === "loading") {
    return (
      <EditorPageShell title="" backLabel={m.backLabel} onBack={handleCancel}>
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </EditorPageShell>
    );
  }

  if (load.phase === "notFound" || !load.track) {
    return (
      <EditorPageShell title="" backLabel={m.backLabel} onBack={handleCancel}>
        <p className="text-sm text-[var(--ds-text-muted)] text-center py-12">{m.notFound}</p>
      </EditorPageShell>
    );
  }

  const track = load.track;
  const linksByService = new Map(track.serviceLinks.map((l) => [l.service, l.url]));

  const toolbar = (
    <div className="flex items-center gap-3 ml-auto">
      {save.saved && (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircleIcon weight="duotone" className="w-3.5 h-3.5" />
          {common.saved}
        </span>
      )}
      {save.error && <p className="text-xs text-red-500">{save.error}</p>}
      <EditorToolbarButton
        variant="neutral"
        icon={<XCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
        onClick={handleCancel}
      >
        {common.cancel}
      </EditorToolbarButton>
      <EditorToolbarButton
        variant="primary"
        icon={<FloppyDiskIcon weight="duotone" className="w-3.5 h-3.5" />}
        onClick={handleSave}
        disabled={save.saving}
      >
        {save.saving ? common.saving : common.save}
      </EditorToolbarButton>
    </div>
  );

  return (
    <EditorPageShell
      title={track.title}
      backLabel={m.backLabel}
      onBack={handleCancel}
      toolbar={toolbar}
      cardClassName="!flex-initial w-[60%]"
    >
      <div className="flex gap-6">
        {/* Left column: Cover + Source Logo + Date */}
        <div className="shrink-0 flex flex-col items-center gap-6 w-[250px]">
          {track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt=""
              width={250}
              height={250}
              className="w-[250px] h-[250px] rounded-lg object-cover bg-[var(--ds-surface-raised)]"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div
            className={`w-[250px] h-[250px] rounded-lg bg-[var(--ds-surface-raised)] flex items-center justify-center text-[var(--ds-text-muted)] text-sm${track.artworkUrl ? " hidden" : ""}`}
          >
            250 x 250
          </div>

          <div className="flex flex-col items-center gap-2">
            {track.sourceService && isValidServiceId(track.sourceService) ? (
              track.sourceUrl ? (
                <a href={track.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <PlatformIcon platform={track.sourceService} colored className="w-9 h-9" />
                </a>
              ) : (
                <PlatformIcon platform={track.sourceService} colored className="w-9 h-9" />
              )
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[var(--ds-surface-raised)] flex items-center justify-center text-[var(--ds-text-muted)] text-xs">
                {track.sourceService ?? "\u2014"}
              </div>
            )}
            <span className="text-xs text-[var(--ds-text-muted)]">
              {m.createdAt}: {new Date(track.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </span>
          </div>
        </div>

        {/* Right column: Fields + Service URLs */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="track-title" className={labelClass}>
                {m.title}
              </label>
              <input
                id="track-title"
                type="text"
                value={form.title}
                onChange={(e) => formDispatch({ type: "set", field: "title", value: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="track-artists" className={labelClass}>
                {m.artists}
              </label>
              <input
                id="track-artists"
                type="text"
                value={form.artists}
                onChange={(e) => formDispatch({ type: "set", field: "artists", value: e.target.value })}
                className={fieldClass}
                placeholder={m.artistsHint}
              />
            </div>
            <div>
              <label htmlFor="track-album" className={labelClass}>
                {m.albumName}
              </label>
              <input
                id="track-album"
                type="text"
                value={form.albumName}
                onChange={(e) => formDispatch({ type: "set", field: "albumName", value: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="track-isrc" className={labelClass}>
                {m.isrc}
              </label>
              <input
                id="track-isrc"
                type="text"
                value={form.isrc}
                onChange={(e) => formDispatch({ type: "set", field: "isrc", value: e.target.value })}
                className={fieldClass}
              />
            </div>
          </div>

          {/* Artwork URL */}
          <div>
            <label htmlFor="track-artwork-url" className={labelClass}>
              {m.artworkUrl}
            </label>
            <input
              id="track-artwork-url"
              type="text"
              value={form.artworkUrl}
              onChange={(e) => formDispatch({ type: "set", field: "artworkUrl", value: e.target.value })}
              className={fieldClass}
            />
          </div>

          {/* Service URLs */}
          <div className="pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)] mb-4">
              {m.serviceUrls}
            </h3>
            <div className="space-y-3">
              {[...SERVICE_DISPLAY_ORDER]
                .sort((a, b) =>
                  PLATFORM_CONFIG[a as ServiceId].label.localeCompare(PLATFORM_CONFIG[b as ServiceId].label),
                )
                .map((service) => {
                  const platform = service as ServiceId;
                  const label = PLATFORM_CONFIG[platform].label;
                  const url = linksByService.get(service);
                  return (
                    <div key={service}>
                      <label htmlFor={`service-url-${service}`} className={labelClass}>
                        {label}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`service-url-${service}`}
                          type="text"
                          readOnly
                          value={url ?? ""}
                          className={readOnlyClass}
                        />
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control border border-[var(--ds-btn-neutral-border)] text-[var(--ds-btn-neutral-text)] hover:border-[var(--ds-btn-neutral-hover-border)] hover:bg-[var(--ds-btn-neutral-hover-bg)] transition-colors"
                            title={label}
                          >
                            <ArrowSquareOutIcon weight="duotone" className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="shrink-0 w-9 h-9 flex items-center justify-center rounded-control border border-[var(--ds-border)] text-[var(--ds-text-muted)] opacity-40 cursor-default">
                            <ArrowSquareOutIcon weight="duotone" className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </EditorPageShell>
  );
}
