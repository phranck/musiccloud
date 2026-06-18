import type { HTMLAttributes } from "react";

function cx(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("flex flex-1 min-h-0 flex-col", className)} {...props} />;
}

export function PageBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("flex flex-1 min-h-0 flex-col", className)} {...props} />;
}
