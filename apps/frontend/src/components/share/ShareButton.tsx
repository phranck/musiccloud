import { CheckIcon, LinkSimpleIcon, ShareNetworkIcon, WarningIcon } from "@phosphor-icons/react";
import { type CSSProperties, useCallback, useState, useSyncExternalStore } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

interface ShareButtonProps {
  shareUrl: string;
  songTitle?: string;
  artistName?: string;
}

type ShareState = "idle" | "copied" | "error";

export function ShareButton({ shareUrl, songTitle, artistName }: ShareButtonProps) {
  const t = useT();
  const [state, setState] = useState<ShareState>("idle");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
    } catch {
      setState("error");
    }
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

  const supportsNativeShare = useSyncExternalStore(
    subscribe,
    () => !!navigator.share,
    () => false,
  );

  return (
    <div className="flex gap-0.5">
      <RecessedCard className="p-[0.1875rem] flex-1" radius={{ base: "0.625rem", sm: "0.875rem" }}>
        <RecessedCard.Body>
          <EmbossedButton
            as="button"
            type="button"
            onClick={handleCopy}
            aria-label={t("share.copyLink")}
            className={cn(
              "flex w-full min-h-[50px] items-center justify-center gap-2",
              "font-bold text-[15px] tracking-[-0.01em] text-text-primary",
              state === "copied" && "text-success",
              state === "error" && "text-error",
            )}
            style={
              state === "idle"
                ? ({
                    color: "#7aebff",
                  } as CSSProperties)
                : undefined
            }
          >
            {state === "idle" && (
              <>
                <LinkSimpleIcon size={20} weight="duotone" />
                {t("share.shareLink")}
              </>
            )}
            {state === "copied" && (
              <>
                <CheckIcon size={16} weight="duotone" />
                {t("share.copied")}
              </>
            )}
            {state === "error" && (
              <>
                <WarningIcon size={16} weight="duotone" />
                {t("share.copyError")}
              </>
            )}
          </EmbossedButton>
        </RecessedCard.Body>
      </RecessedCard>

      {supportsNativeShare && (
        <RecessedCard className="p-[0.1875rem] flex-none" radius={{ base: "0.625rem", sm: "0.875rem" }}>
          <RecessedCard.Body>
            <EmbossedButton
              as="button"
              type="button"
              onClick={handleNativeShare}
              className="flex min-h-[50px] items-center justify-center px-4 py-0"
              aria-label={songTitle ? t("share.nativeShare", { title: songTitle }) : t("share.shareLink")}
            >
              <ShareNetworkIcon size={24} weight="duotone" className="text-text-primary" />
            </EmbossedButton>
          </RecessedCard.Body>
        </RecessedCard>
      )}
    </div>
  );
}
