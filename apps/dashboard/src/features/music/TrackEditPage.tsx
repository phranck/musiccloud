import { DashboardButtonVariant, DashboardInput, getDashboardIconButtonClassName } from "@musiccloud/dashboard-ui";
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
  artistCredits: ArtistCredit[];
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

interface ArtistCredit {
  artistEntityId: string;
  name: string;
  role: "main";
  position: number;
}

function sortServiceDisplayOrder(services: readonly string[]) {
  const sorted = Array.from(services);
  sorted.sort((a, b) => PLATFORM_CONFIG[a as ServiceId].label.localeCompare(PLATFORM_CONFIG[b as ServiceId].label));
  return sorted;
}

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

const LoadPhase = {
  Loading: "loading",
  Loaded: "loaded",
  NotFound: "notFound",
} as const;

const LoadActionType = {
  Loaded: "loaded",
  NotFound: "notFound",
  Reload: "reload",
} as const;

interface LoadState {
  phase: (typeof LoadPhase)[keyof typeof LoadPhase];
  track: TrackDetail | null;
}
type LoadAction =
  | { type: typeof LoadActionType.Loaded; track: TrackDetail }
  | { type: typeof LoadActionType.NotFound }
  | { type: typeof LoadActionType.Reload };

function loadReducer(_state: LoadState, action: LoadAction): LoadState {
  switch (action.type) {
    case LoadActionType.Loaded:
      return { phase: LoadPhase.Loaded, track: action.track };
    case LoadActionType.NotFound:
      return { phase: LoadPhase.NotFound, track: null };
    case LoadActionType.Reload:
      return { phase: LoadPhase.Loading, track: null };
  }
}

interface FormState {
  title: string;
  artists: string;
  artistCredits: ArtistCredit[];
  albumName: string;
  isrc: string;
  artworkUrl: string;
}

const FormActionType = {
  Set: "set",
  Hydrate: "hydrate",
} as const;

type FormAction =
  | { type: typeof FormActionType.Set; field: keyof FormState; value: string }
  | { type: typeof FormActionType.Hydrate; form: FormState };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case FormActionType.Set:
      return { ...state, [action.field]: action.value };
    case FormActionType.Hydrate:
      return action.form;
  }
}

const emptyForm: FormState = { title: "", artists: "", artistCredits: [], albumName: "", isrc: "", artworkUrl: "" };

function parseArtistNames(value: string): string[] {
  return value.split(",").flatMap((a) => {
    const trimmed = a.trim();
    return trimmed ? [trimmed] : [];
  });
}

function buildArtistCreditsForSave(form: FormState): ArtistCredit[] | undefined {
  const names = parseArtistNames(form.artists);
  if (names.length !== form.artistCredits.length) return undefined;

  const credits = names.map((name, index) => {
    const existing = form.artistCredits[index];
    if (!existing || existing.name !== name) return null;
    return { ...existing, position: index };
  });

  return credits.every(Boolean) ? (credits as ArtistCredit[]) : undefined;
}

interface SaveState {
  saving: boolean;
  saved: boolean;
  error: string | null;
}

const SaveActionType = {
  Start: "start",
  Success: "success",
  ClearSaved: "clearSaved",
  Error: "error",
} as const;

type SaveAction =
  | { type: typeof SaveActionType.Start }
  | { type: typeof SaveActionType.Success }
  | { type: typeof SaveActionType.ClearSaved }
  | { type: typeof SaveActionType.Error; error: string };

function saveReducer(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    case SaveActionType.Start:
      return { saving: true, saved: false, error: null };
    case SaveActionType.Success:
      return { saving: false, saved: true, error: null };
    case SaveActionType.ClearSaved:
      return { ...state, saved: false };
    case SaveActionType.Error:
      return { saving: false, saved: false, error: action.error };
  }
}

export function TrackEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { messages } = useI18n();
  const m = messages.music.trackEdit;
  const common = messages.common;

  const [load, loadDispatch] = useReducer(loadReducer, { phase: LoadPhase.Loading, track: null });
  const [form, formDispatch] = useReducer(formReducer, emptyForm);
  const [save, saveDispatch] = useReducer(saveReducer, { saving: false, saved: false, error: null });

  useEffect(() => {
    if (!id) return;
    loadDispatch({ type: LoadActionType.Reload });
    api
      .get<TrackDetail>(ENDPOINTS.admin.tracks.detail(id))
      .then((data) => {
        loadDispatch({ type: LoadActionType.Loaded, track: data });
        formDispatch({
          type: FormActionType.Hydrate,
          form: {
            title: data.title,
            artists: data.artists.join(", "),
            artistCredits: data.artistCredits ?? [],
            albumName: data.albumName ?? "",
            isrc: data.isrc ?? "",
            artworkUrl: data.artworkUrl ?? "",
          },
        });
      })
      .catch(() => loadDispatch({ type: LoadActionType.NotFound }));
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!id || save.saving) return;
    saveDispatch({ type: SaveActionType.Start });
    try {
      const artistCredits = buildArtistCreditsForSave(form);
      await api.patch(ENDPOINTS.admin.tracks.detail(id), {
        title: form.title,
        artists: parseArtistNames(form.artists),
        ...(artistCredits ? { artistCredits } : {}),
        albumName: form.albumName || null,
        isrc: form.isrc || null,
        artworkUrl: form.artworkUrl || null,
      });
      saveDispatch({ type: SaveActionType.Success });
      setTimeout(() => saveDispatch({ type: SaveActionType.ClearSaved }), 2000);
    } catch {
      saveDispatch({ type: SaveActionType.Error, error: m.saveError });
    }
  }, [id, save.saving, form, m.saveError]);

  useKeyboardSave(handleSave);

  function handleCancel() {
    navigate("/tracks");
  }

  if (load.phase === LoadPhase.Loading) {
    return (
      <EditorPageShell title="" backLabel={m.backLabel} onBack={handleCancel}>
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </EditorPageShell>
    );
  }

  if (load.phase === LoadPhase.NotFound || !load.track) {
    return (
      <EditorPageShell title="" backLabel={m.backLabel} onBack={handleCancel}>
        <p className="text-sm text-[var(--ds-text-muted)] text-center py-12">{m.notFound}</p>
      </EditorPageShell>
    );
  }

  const track = load.track;
  const linksByService = new Map(track.serviceLinks.map((l) => [l.service, l.url]));
  const activeArtistCredits = buildArtistCreditsForSave(form) ?? [];

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
        variant={DashboardButtonVariant.Neutral}
        icon={<XCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
        onClick={handleCancel}
      >
        {common.cancel}
      </EditorToolbarButton>
      <EditorToolbarButton
        variant={DashboardButtonVariant.Primary}
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
                  <PlatformIcon platform={track.sourceService} colored className="size-9" />
                </a>
              ) : (
                <PlatformIcon platform={track.sourceService} colored className="size-9" />
              )
            ) : (
              <div className="size-9 rounded-lg bg-[var(--ds-surface-raised)] flex items-center justify-center text-[var(--ds-text-muted)] text-xs">
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
              <DashboardInput
                id="track-title"
                type="text"
                value={form.title}
                onChange={(e) => formDispatch({ type: FormActionType.Set, field: "title", value: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="track-artists" className={labelClass}>
                {m.artists}
              </label>
              <DashboardInput
                id="track-artists"
                type="text"
                value={form.artists}
                onChange={(e) => formDispatch({ type: FormActionType.Set, field: "artists", value: e.target.value })}
                placeholder={m.artistsHint}
              />
              {activeArtistCredits.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeArtistCredits.map((credit) => (
                    <span
                      key={`${credit.artistEntityId}-${credit.position}`}
                      className="rounded-md border border-[var(--ds-border-subtle)] px-2 py-1 text-[11px] text-[var(--ds-text-muted)]"
                      title={credit.artistEntityId}
                    >
                      {credit.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <label htmlFor="track-album" className={labelClass}>
                {m.albumName}
              </label>
              <DashboardInput
                id="track-album"
                type="text"
                value={form.albumName}
                onChange={(e) => formDispatch({ type: FormActionType.Set, field: "albumName", value: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="track-isrc" className={labelClass}>
                {m.isrc}
              </label>
              <DashboardInput
                id="track-isrc"
                type="text"
                value={form.isrc}
                onChange={(e) => formDispatch({ type: FormActionType.Set, field: "isrc", value: e.target.value })}
              />
            </div>
          </div>

          {/* Artwork URL */}
          <div>
            <label htmlFor="track-artwork-url" className={labelClass}>
              {m.artworkUrl}
            </label>
            <DashboardInput
              id="track-artwork-url"
              type="text"
              value={form.artworkUrl}
              onChange={(e) => formDispatch({ type: FormActionType.Set, field: "artworkUrl", value: e.target.value })}
            />
          </div>

          {/* Service URLs */}
          <div className="pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)] mb-4">
              {m.serviceUrls}
            </h3>
            <div className="space-y-3">
              {sortServiceDisplayOrder(SERVICE_DISPLAY_ORDER).map((service) => {
                  const platform = service as ServiceId;
                  const label = PLATFORM_CONFIG[platform].label;
                  const url = linksByService.get(service);
                  return (
                    <div key={service}>
                      <label htmlFor={`service-url-${service}`} className={labelClass}>
                        {label}
                      </label>
                      <div className="flex items-center gap-2">
                        <DashboardInput
                          id={`service-url-${service}`}
                          type="text"
                          readOnly
                          value={url ?? ""}
                          className="bg-[var(--ds-surface-raised)] text-[var(--ds-text-muted)] cursor-default"
                        />
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={getDashboardIconButtonClassName({
                              className: "shrink-0",
                              size: "control",
                              variant: DashboardButtonVariant.Neutral,
                            })}
                            title={label}
                          >
                            <ArrowSquareOutIcon weight="duotone" className="w-4 h-4" />
                          </a>
                        ) : (
                          <span
                            className={getDashboardIconButtonClassName({
                              className: "shrink-0 opacity-40 cursor-default",
                              size: "control",
                              variant: DashboardButtonVariant.Neutral,
                            })}
                          >
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
