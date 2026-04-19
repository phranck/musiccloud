import { CheckIcon, LinkSimpleIcon, ShareNetworkIcon, WarningIcon } from "@phosphor-icons/react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { EmbossedButton, iconInnerShadow } from "@/components/ui/EmbossedButton";
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
    <div className="flex gap-1.5">
      <EmbossedButton
        as="button"
        type="button"
        onClick={handleCopy}
        aria-label={t("share.copyLink")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2",
          "rounded-[4px] sm:rounded-lg font-bold text-[15px] tracking-[-0.01em]",
          "min-h-[50px]",
          "shadow-sm",
          state === "idle"
            ? [
                // Background resolves through a sentinel CSS var: when the
                // dynamic accent has been extracted from the album art (see
                // ShareLayout), `--color-accent-resolved` is set and the
                // button shows the accent. Until then the var is absent and
                // the fallback keeps the button in the neutral embossed
                // state — no "flash of default accent" on first paint.
                "bg-[var(--color-accent-resolved,rgba(255,255,255,0.09))]",
                "hover:bg-[var(--color-accent-hover-resolved,rgba(255,255,255,0.12))]",
              ]
            : state === "copied"
              ? "bg-success/20 text-success"
              : "bg-error/20 text-error",
        )}
        style={
          state === "idle"
            ? ({
                color: "var(--color-accent-contrast-resolved, var(--color-text-primary))",
                boxShadow: "3px 3px 10px rgba(0,0,0,0.6), -2px -2px 6px rgba(255,255,255,0.10)",
                // Embossed border tints: only meaningful once the accent has
                // resolved. Before that, fall back to neutral whites/blacks
                // so the border looks right on the raw embossed surface.
                "--neu-light": "color-mix(in hsl, var(--color-accent-resolved, rgba(255,255,255,0.6)), white 40%)",
                "--neu-shadow": "color-mix(in hsl, var(--color-accent-resolved, rgba(0,0,0,0.6)), black 65%)",
                transition: "background-color 220ms ease-out, color 220ms ease-out, box-shadow 220ms ease-out",
              } as React.CSSProperties)
            : state === "copied"
              ? {
                  boxShadow: "3px 3px 10px rgba(0,0,0,0.6), -2px -2px 6px rgba(48,209,88,0.10)",
                }
              : {
                  boxShadow: "3px 3px 10px rgba(0,0,0,0.6), -2px -2px 6px rgba(255,69,58,0.15)",
                }
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

      {supportsNativeShare && (
        <EmbossedButton
          as="button"
          type="button"
          onClick={handleNativeShare}
          className="rounded-[4px] sm:rounded-lg px-4 py-3"
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
