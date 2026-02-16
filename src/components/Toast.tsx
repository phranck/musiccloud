import { useEffect } from "react";
import { cn } from "../lib/utils";

type ToastVariant = "success" | "error" | "info";

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

const variantIcons: Record<ToastVariant, string> = {
  success: "M5 13l4 4L19 7",
  error: "M6 18L18 6M6 6l12 12",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

export function Toast({
  message,
  variant,
  visible,
  onDismiss,
  duration = 3000,
}: ToastProps) {
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
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none",
      )}
    >
      <svg
        className="w-5 h-5 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={variantIcons[variant]}
        />
      </svg>
      <span className="text-sm font-medium text-text-primary">{message}</span>
    </div>
  );
}
