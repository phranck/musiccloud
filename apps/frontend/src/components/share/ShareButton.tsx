import { CheckIcon, LinkSimpleIcon, ShareNetworkIcon, WarningIcon } from "@phosphor-icons/react";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  recessedControlHeightClassName,
  recessedControlInsetClassName,
  recessedControlSizeClassName,
} from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { sendMusicSignal } from "@/lib/analytics/umami";
import type { MediaCardContentType } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

const ShareButtonState = {
  Idle: "idle",
  Copied: "copied",
  Error: "error",
} as const;

interface ShareButtonProps {
  shareUrl: string;
  songTitle?: string;
  artistName?: string;
  contentType?: MediaCardContentType;
}

type ShareState = (typeof ShareButtonState)[keyof typeof ShareButtonState];

export function ShareButton({ shareUrl, songTitle, artistName, contentType }: ShareButtonProps) {
  const t = useT();
  const [state, setState] = useState<ShareState>(ShareButtonState.Idle);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      sendMusicSignal("music_share_interaction", {
        action: "copy_success",
        method: "clipboard",
        content_type: contentType,
      });
      setState(ShareButtonState.Copied);
    } catch {
      sendMusicSignal("music_share_interaction", {
        action: "copy_error",
        method: "clipboard",
        content_type: contentType,
      });
      setState(ShareButtonState.Error);
    }
    setTimeout(() => setState(ShareButtonState.Idle), 2000);
  }, [contentType, shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: songTitle ? `${songTitle}${artistName ? ` - ${artistName}` : ""}` : "Check out this song",
        url: shareUrl,
      });
      sendMusicSignal("music_share_interaction", {
        action: "share_success",
        method: "native",
        content_type: contentType,
      });
    } catch {
      sendMusicSignal("music_share_interaction", {
        action: "share_cancelled",
        method: "native",
        content_type: contentType,
      });
    }
  }, [contentType, shareUrl, songTitle, artistName]);

  const supportsNativeShare = useSyncExternalStore(
    subscribe,
    () => !!navigator.share,
    () => false,
  );

  return (
    <div className="flex items-center gap-3">
      {supportsNativeShare && (
        <RecessedCard className={cn(recessedControlInsetClassName, "flex-none", recessedControlSizeClassName)}>
          <RecessedCard.Body className="h-full">
            <EmbossedButton
              as="button"
              type="button"
              onClick={handleNativeShare}
              className="flex size-full min-h-0 items-center justify-center px-0 py-0"
              aria-label={songTitle ? t("share.nativeShare", { title: songTitle }) : t("share.shareLink")}
            >
              <ShareNetworkIcon size={24} weight="duotone" className="text-vfd-phosphor" />
            </EmbossedButton>
          </RecessedCard.Body>
        </RecessedCard>
      )}

      <RecessedCard className={cn(recessedControlInsetClassName, "flex-1", recessedControlHeightClassName)}>
        <RecessedCard.Body className="h-full">
          <EmbossedButton
            as="button"
            type="button"
            onClick={handleCopy}
            aria-label={t("share.copyLink")}
            className={cn(
              "flex h-full min-h-0 w-full items-center justify-center gap-2 py-0",
              "font-bold text-[15px] tracking-[-0.01em] text-text-primary",
              state === ShareButtonState.Idle && "text-vfd-phosphor",
              state === ShareButtonState.Copied && "text-success",
              state === ShareButtonState.Error && "text-error",
            )}
          >
            {state === ShareButtonState.Idle && (
              <>
                <LinkSimpleIcon size={20} weight="duotone" />
                {t("share.shareLink")}
              </>
            )}
            {state === ShareButtonState.Copied && (
              <>
                <CheckIcon size={16} weight="duotone" />
                {t("share.copied")}
              </>
            )}
            {state === ShareButtonState.Error && (
              <>
                <WarningIcon size={16} weight="duotone" />
                {t("share.copyError")}
              </>
            )}
          </EmbossedButton>
        </RecessedCard.Body>
      </RecessedCard>
    </div>
  );
}
