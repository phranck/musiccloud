import { CheckCircleIcon, type Icon, InfoIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { ToastVariant, type ToastVariant as ToastVariantType } from "@/components/ui/ToastTypes";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  variant: ToastVariantType;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

const variantStyles: Record<ToastVariantType, string> = {
  [ToastVariant.Success]: "border-green-400/30",
  [ToastVariant.Error]: "border-red-400/30",
  [ToastVariant.Info]: "border-blue-400/30",
};

const variantIcons: Record<ToastVariantType, Icon> = {
  [ToastVariant.Success]: CheckCircleIcon,
  [ToastVariant.Error]: XCircleIcon,
  [ToastVariant.Info]: InfoIcon,
};

export function Toast({ message, variant, visible, onDismiss, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  return (
    <div
      role="alert"
      aria-live={variant === ToastVariant.Error ? "assertive" : "polite"}
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "px-5 py-3 rounded-xl",
        "bg-surface-elevated",
        "border",
        "flex items-center gap-3",
        // Only opacity + transform change between states; name them explicitly
        // instead of `transition-all` so the animation stays on the GPU and a
        // future layout-affecting class cannot silently start animating on the
        // main thread.
        "transition-[opacity,transform] duration-350",
        variantStyles[variant],
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
      )}
    >
      {(() => {
        const Icon = variantIcons[variant];
        return <Icon size={20} weight="duotone" className="flex-shrink-0" />;
      })()}
      <span className="text-sm font-medium text-text-primary">{message}</span>
    </div>
  );
}
