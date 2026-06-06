export const ToastVariant = {
  Success: "success",
  Error: "error",
  Info: "info",
} as const;

export type ToastVariant = (typeof ToastVariant)[keyof typeof ToastVariant];
