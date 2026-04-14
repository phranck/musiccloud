import type { Platform } from "@musiccloud/shared";
import { ENDPOINTS, isValidPlatform, PLATFORM_CONFIG, SERVICE_DISPLAY_ORDER } from "@musiccloud/shared";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  CheckCircle as CheckCircleIcon,
  FloppyDisk as FloppyDiskIcon,
  SpinnerGap as SpinnerGapIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
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

export function TrackEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { messages } = useI18n();
  const m = messages.music.trackEdit;
  const common = messages.common;

  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState("");
  const [artists, setArtists] = useState("");
  const [albumName, setAlbumName] = useState("");
  const [isrc, setIsrc] = useState("");
  const [artworkUrl, setArtworkUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<TrackDetail>(ENDPOINTS.admin.tracks.detail(id))
      .then((data) => {
        setTrack(data);
        setTitle(data.title);
        setArtists(data.artists.join(", "));
        setAlbumName(data.albumName ?? "");
        setIsrc(data.isrc ?? "");
        setArtworkUrl(data.artworkUrl ?? "");
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!id || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch(ENDPOINTS.admin.tracks.detail(id), {
        title,
        artists: artists
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        albumName: albumName || null,
        isrc: isrc || null,
        artworkUrl: artworkUrl || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError(m.saveError);
    } finally {
      setSaving(false);
    }
  }, [id, saving, title, artists, albumName, isrc, artworkUrl, m.saveError]);

  useKeyboardSave(handleSave);

  function handleCancel() {
    navigate("/tracks");
  }

  if (loading) {
    return (
      <EditorPageShell title="" backLabel={m.backLabel} onBack={handleCancel}>
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </EditorPageShell>
    );
  }

  if (notFound || !track) {
    return (
      <EditorPageShell title="" backLabel={m.backLabel} onBack={handleCancel}>
        <p className="text-sm text-[var(--ds-text-muted)] text-center py-12">{m.notFound}</p>
      </EditorPageShell>
    );
  }

  const linksByService = new Map(track.serviceLinks.map((l) => [l.service, l.url]));

  const toolbar = (
    <div className="flex items-center gap-3 ml-auto">
      {saved && (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircleIcon weight="duotone" className="w-3.5 h-3.5" />
          {common.saved}
        </span>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
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
        disabled={saving}
      >
        {saving ? common.saving : common.save}
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
            {track.sourceService && isValidPlatform(track.sourceService) ? (
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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
                value={artists}
                onChange={(e) => setArtists(e.target.value)}
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
                value={albumName}
                onChange={(e) => setAlbumName(e.target.value)}
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
                value={isrc}
                onChange={(e) => setIsrc(e.target.value)}
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
              value={artworkUrl}
              onChange={(e) => setArtworkUrl(e.target.value)}
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
                  PLATFORM_CONFIG[a as Platform].label.localeCompare(PLATFORM_CONFIG[b as Platform].label),
                )
                .map((service) => {
                  const platform = service as Platform;
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
