import { CheckIcon, LinkSimpleIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { EmbossedButton, iconInnerShadow } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  shareUrl: string;
  songTitle?: string;
  artistName?: string;
}

type ShareState = "idle" | "copied";

export function ShareButton({ shareUrl, songTitle, artistName }: ShareButtonProps) {
  const t = useT();
  const [state, setState] = useState<ShareState>("idle");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard unavailable (non-secure context or permissions denied)
    }
    setState("copied");
    setTimeout(() => setState("idle"), 2000);
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

  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  useEffect(() => {
    setSupportsNativeShare(!!navigator.share);
  }, []);

  return (
    <div className="flex gap-2">
      <EmbossedButton
        as="button"
        type="button"
        onClick={handleCopy}
        aria-label={t("share.copyLink")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2",
          "rounded-lg font-bold text-[15px] tracking-[-0.01em]",
          "min-h-[50px]",
          "shadow-sm",
          state === "idle" ? "bg-accent hover:bg-accent-hover" : "bg-success/20 text-success",
        )}
        style={
          state === "idle"
            ? {
                color: "var(--color-accent-contrast)",
                boxShadow: "3px 3px 10px rgba(0,0,0,0.6), -2px -2px 6px rgba(255,255,255,0.10)",
              }
            : {
                boxShadow: "3px 3px 10px rgba(0,0,0,0.6), -2px -2px 6px rgba(48,209,88,0.10)",
              }
        }
      >
        {state === "idle" ? (
          <>
            <LinkSimpleIcon size={20} weight="duotone" />
            {t("share.shareLink")}
          </>
        ) : (
          <>
            <CheckIcon size={16} weight="duotone" />
            {t("share.copied")}
          </>
        )}
      </EmbossedButton>

      {supportsNativeShare && (
        <EmbossedButton
          as="button"
          type="button"
          onClick={handleNativeShare}
          className="rounded-lg px-4 py-3"
          hasInnerShadow
          aria-label={songTitle ? t("share.nativeShare", { title: songTitle }) : t("share.shareLink")}
        >
          <ShareNetworkIcon
            size={24}
            weight="duotone"
            className="text-text-primary"
            style={{ filter: iconInnerShadow }}
          />
        </EmbossedButton>
      )}
    </div>
  );
}
