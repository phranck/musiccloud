import { SealWarningIcon } from "@phosphor-icons/react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
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
            <h2 id="mc-alert-title" className="text-lg font-semibold leading-tight text-text-primary">
              {title}
            </h2>
          </EmbossedCard.Header>

          <EmbossedCard.Body className="px-3 pt-4">
            <div className="flex items-start gap-4">
              <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 text-error">
                <SealWarningIcon size={22} weight="duotone" />
              </div>
              <p id="mc-alert-message" className="min-w-0 text-sm leading-6 text-text-secondary">
                {message}
              </p>
            </div>
          </EmbossedCard.Body>

          <EmbossedCard.Footer className="flex justify-end px-3 pt-5 pb-2">
            <EmbossedButton as="button" onClick={onClose} className="min-w-24 text-sm font-semibold" noScale>
              {closeLabel}
            </EmbossedButton>
          </EmbossedCard.Footer>
        </EmbossedCard>
      </dialog>
    </div>
  );
}
