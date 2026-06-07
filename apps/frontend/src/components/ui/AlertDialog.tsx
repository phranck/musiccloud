import { SealWarningIcon } from "@phosphor-icons/react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { OverlayBackdrop } from "@/components/ui/OverlayBackdrop";
import { OverlayBackdropPlacement } from "@/components/ui/OverlayBackdropTypes";
import { solidEmbossedCardStyle } from "@/styles/neumorphic";

interface AlertDialogProps {
  open: boolean;
  title: string;
  message: string;
  closeLabel: string;
  onClose: () => void;
}

export function AlertDialog({ open, title, message, closeLabel, onClose }: AlertDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="presentation">
      <OverlayBackdrop
        open={open}
        onClick={onClose}
        ariaLabel={closeLabel}
        placement={OverlayBackdropPlacement.Fixed}
      />

      <dialog
        open
        role="alertdialog"
        aria-modal={true}
        aria-labelledby="mc-alert-title"
        aria-describedby="mc-alert-message"
        className="relative z-10 m-0 w-full max-w-[440px] border-0 bg-transparent p-0 text-left text-text-primary animate-fade-in"
      >
        <EmbossedCard style={solidEmbossedCardStyle} radius="24px" padding="14px">
          <EmbossedCard.Header className="px-3 pt-2">
            <div className="flex items-center gap-3">
              <SealWarningIcon size={32} weight="duotone" className="shrink-0 text-error" />
              <h2 id="mc-alert-title" className="min-w-0 text-lg font-semibold leading-tight text-text-primary">
                {title}
              </h2>
            </div>
          </EmbossedCard.Header>

          <EmbossedCard.Body className="px-3 pt-4">
            <p id="mc-alert-message" className="text-[1.0625rem] leading-7 text-text-secondary">
              {message}
            </p>
          </EmbossedCard.Body>

          <EmbossedCard.Footer className="flex justify-end px-3 pt-5 pb-2">
            <RecessedCard padding="2px">
              <EmbossedButton as="button" onClick={onClose} className="min-w-24 py-2 text-sm font-semibold" noScale>
                {closeLabel}
              </EmbossedButton>
            </RecessedCard>
          </EmbossedCard.Footer>
        </EmbossedCard>
      </dialog>
    </div>
  );
}
