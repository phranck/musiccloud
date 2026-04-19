import { CheckCircleIcon, type Icon, InfoIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

interface ToastProps {
  message: string;
  variant: ToastVariant;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

const variantStyles: Record<ToastVariant, string> = {
  success: "border-green-400/30",
  error: "border-red-400/30",
  info: "border-blue-400/30",
};

const variantIcons: Record<ToastVariant, Icon> = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  info: InfoIcon,
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
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "px-5 py-3 rounded-xl",
        "bg-surface-elevated/90 backdrop-blur-[20px]",
        "border",
        "shadow-xl",
        "flex items-center gap-3",
        "transition-all duration-350",
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
