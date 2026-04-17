import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { usePageHeaderContext } from "@/context/PageHeaderContext";

interface PageHeaderProps {
  title: string;
  titleContent?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, titleContent, leading, children }: PageHeaderProps) {
  const { setTitle, clearTitle, leadingEl, actionsEl } = usePageHeaderContext();

  useEffect(() => {
    setTitle(title, titleContent ?? null);
    return clearTitle;
  }, [title, titleContent, setTitle, clearTitle]);

  return (
    <>
      {leadingEl && leading ? createPortal(leading, leadingEl) : null}
      {actionsEl && children ? createPortal(children, actionsEl) : null}
    </>
  );
}
