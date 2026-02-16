import { useCallback, useState } from "react";
import { cn } from "../lib/utils";

interface ShareButtonProps {
  shareUrl: string;
  songTitle?: string;
  artistName?: string;
}

type ShareState = "idle" | "copied";

export function ShareButton({
  shareUrl,
  songTitle,
  artistName,
}: ShareButtonProps) {
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
        title: songTitle
          ? `${songTitle}${artistName ? ` - ${artistName}` : ""}`
          : "Check out this song",
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
          "px-5 py-3 rounded-xl font-medium",
          "transition-all duration-200",
          "min-h-[48px]",
          state === "idle"
            ? [
                "bg-accent text-white",
                "hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(124,92,252,0.3)]",
                "active:scale-95",
              ]
            : "bg-green-500/20 text-green-400 border border-green-400/30",
        )}
      >
        {state === "idle" ? (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy Link
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
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
            "border border-white/[0.08]",
            "hover:bg-surface-elevated hover:scale-105",
            "active:scale-95",
            "transition-all duration-100",
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
