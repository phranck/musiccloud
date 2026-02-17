import { useCallback, useState } from "react";
import { cn } from "../lib/utils";

interface ShareButtonProps {
  shareUrl: string;
  songTitle?: string;
  artistName?: string;
}

type ShareState = "idle" | "copied";

export function ShareButton({ shareUrl, songTitle, artistName }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      // Fallback for older browsers
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
      // User cancelled share - this is fine
    }
  }, [shareUrl, songTitle, artistName]);

  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy share link to clipboard"
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
            Share Link
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Copied!
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
          aria-label={`Share ${songTitle ? `"${songTitle}"` : "this song"}`}
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
  );
}
