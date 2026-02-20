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
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M11.19 12.195c2.016-.24 3.77-1.475 3.99-2.603.348-1.778.32-4.339.32-4.339 0-3.47-2.286-4.488-2.286-4.488C12.062.238 10.083.017 8.027 0h-.05C5.92.017 3.942.238 2.79.765c0 0-2.285 1.017-2.285 4.488l-.002.662c-.004.64-.007 1.35.011 2.091.083 3.394.626 6.74 3.78 7.57 1.454.383 2.703.463 3.709.408 1.823-.1 2.847-.647 2.847-.647l-.06-1.317s-1.303.41-2.767.36c-1.45-.05-2.98-.156-3.215-1.928a4 4 0 0 1-.033-.496s1.424.346 3.228.428c1.103.05 2.137-.064 3.188-.189zm1.613-2.47H11.13v-4.08c0-.859-.364-1.295-1.091-1.295-.804 0-1.207.517-1.207 1.541v2.233H7.168V5.89c0-1.024-.403-1.541-1.207-1.541-.727 0-1.091.436-1.091 1.296v4.079H3.197V5.522q0-1.288.66-2.046c.456-.505 1.052-.764 1.793-.764.856 0 1.504.328 1.933.983L8 4.39l.417-.695c.429-.655 1.077-.983 1.934-.983.74 0 1.336.259 1.791.764q.662.757.661 2.046z" />
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
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3.468 1.948C5.303 3.325 7.276 6.118 8 7.616c.725-1.498 2.698-4.29 4.532-5.668C13.855.955 16 .186 16 2.632c0 .489-.28 4.105-.444 4.692-.572 2.04-2.653 2.561-4.504 2.246 3.236.551 4.06 2.375 2.281 4.2-3.376 3.464-4.852-.87-5.23-1.98-.07-.204-.103-.3-.103-.218 0-.081-.033.014-.102.218-.379 1.11-1.855 5.444-5.231 1.98-1.778-1.825-.955-3.65 2.28-4.2-1.85.315-3.932-.205-4.503-2.246C.28 6.737 0 3.12 0 2.632 0 .186 2.145.955 3.468 1.948" />
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
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z" />
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
