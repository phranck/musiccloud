import { useCallback, useState, useRef } from "react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  shareUrl: string;
  songTitle?: string;
  artistName?: string;
}

type ShareState = "idle" | "copied";

const MASTODON_INSTANCE_KEY = "mc_mastodon_instance";

function getStoredMastodonInstance(): string {
  try {
    if (typeof localStorage === "undefined") return "mastodon.social";
    return localStorage.getItem(MASTODON_INSTANCE_KEY) ?? "mastodon.social";
  } catch {
    return "mastodon.social";
  }
}

export function ShareButton({ shareUrl, songTitle, artistName }: ShareButtonProps) {
  const t = useT();
  const [state, setState] = useState<ShareState>("idle");
  const [mastodonOpen, setMastodonOpen] = useState(false);
  const [mastodonInstance, setMastodonInstance] = useState(getStoredMastodonInstance);
  const mastodonInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    }
  }, [shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: songTitle ? `${songTitle}${artistName ? ` - ${artistName}` : ""}` : "Check out this song",
        url: shareUrl,
      });
    } catch {
      // User cancelled share
    }
  }, [shareUrl, songTitle, artistName]);

  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const shareText = [
    songTitle && artistName
      ? `"${songTitle}" by ${artistName} 🎵`
      : songTitle
        ? `"${songTitle}" 🎵`
        : null,
    shareUrl,
  ]
    .filter(Boolean)
    .join(" ");

  function openSocial(url: string) {
    window.open(url, "_blank", "noopener,noreferrer,width=620,height=460");
  }

  function handleTwitter() {
    openSocial(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`);
  }

  function handleBluesky() {
    openSocial(`https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`);
  }

  function handleMastodonToggle() {
    setMastodonOpen((prev) => {
      if (!prev) setTimeout(() => mastodonInputRef.current?.focus(), 50);
      return !prev;
    });
  }

  function handleMastodonShare(e: React.FormEvent) {
    e.preventDefault();
    const instance = mastodonInstance.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!instance) return;
    try { localStorage.setItem(MASTODON_INSTANCE_KEY, instance); } catch {}
    openSocial(`https://${instance}/share?text=${encodeURIComponent(shareText)}`);
    setMastodonOpen(false);
  }

  const socialButtonClass = cn(
    "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-medium",
    "bg-surface-elevated/60 backdrop-blur-sm",
    "border border-white/[0.08]",
    "text-text-secondary hover:text-text-primary",
    "hover:bg-surface-elevated hover:border-white/[0.14] hover:scale-[1.02]",
    "active:scale-[0.97]",
    "transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
  );

  return (
    <div className="flex flex-col gap-2.5">
      {/* Main row: Copy Link + optional native share */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCopy}
          aria-label={t("share.copyLink")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2",
            "px-5 py-3.5 rounded-xl font-semibold text-[15px] tracking-[-0.01em]",
            "transition-all duration-[250ms]",
            "min-h-[50px]",
            "shadow-sm",
            state === "idle"
              ? [
                  "bg-accent text-[var(--color-accent-contrast)]",
                  "border border-white/20",
                  "hover:bg-accent-hover hover:shadow-[0_0_16px_var(--color-accent-glow)]",
                  "hover:scale-[1.02]",
                  "active:scale-[0.97]",
                ]
              : "bg-success/20 text-success border border-success/30",
          )}
        >
          {state === "idle" ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              {t("share.shareLink")}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {t("share.copied")}
            </>
          )}
        </button>

        {supportsNativeShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            className={cn(
              "px-4 py-3 rounded-xl",
              "bg-surface-elevated/80 backdrop-blur-sm",
              "border border-white/[0.06]",
              "hover:bg-surface-elevated hover:scale-[1.03]",
              "active:scale-[0.97]",
              "transition-all duration-150",
            )}
            aria-label={songTitle ? t("share.nativeShare", { title: songTitle }) : t("share.shareLink")}
          >
            <svg
              className="w-5 h-5 text-text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Social share row */}
      <div className="flex gap-2">
        {/* Mastodon */}
        <button
          type="button"
          onClick={handleMastodonToggle}
          className={cn(socialButtonClass, mastodonOpen && "bg-surface-elevated border-white/[0.14] text-text-primary")}
          aria-label={t("share.shareOnMastodon")}
          aria-expanded={mastodonOpen}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z" />
          </svg>
          <span>Mastodon</span>
        </button>

        {/* Bluesky */}
        <button
          type="button"
          onClick={handleBluesky}
          className={socialButtonClass}
          aria-label={t("share.shareOnBluesky")}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.967 3.282 3.811 5.686 3.145 4.647-1.292 5.09 2.1 5.09 2.1s.443-3.392 5.09-2.1c2.404.666 4.871-.178 5.686-3.145.246-.828.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.66-.299-1.664-.621-4.3 1.24C14.046 4.747 13.087 8.686 12 10.8z" />
          </svg>
          <span>Bluesky</span>
        </button>

        {/* X (Twitter) */}
        <button
          type="button"
          onClick={handleTwitter}
          className={socialButtonClass}
          aria-label={t("share.shareOnX")}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>X</span>
        </button>
      </div>

      {/* Mastodon instance input */}
      {mastodonOpen && (
        <form onSubmit={handleMastodonShare} className="flex gap-2">
          <input
            ref={mastodonInputRef}
            type="text"
            value={mastodonInstance}
            onChange={(e) => setMastodonInstance(e.target.value)}
            placeholder="mastodon.social"
            aria-label={t("share.mastodonInstance")}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-xs",
              "bg-surface-elevated/60 backdrop-blur-sm",
              "border border-white/[0.10]",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/40",
            )}
          />
          <button
            type="submit"
            className={cn(
              "px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0",
              "bg-accent text-[var(--color-accent-contrast)]",
              "hover:bg-accent-hover transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-accent/50",
            )}
          >
            {t("share.mastodonShare")}
          </button>
        </form>
      )}
    </div>
  );
}
