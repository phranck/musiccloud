import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { usePageHeaderContext } from "@/context/PageHeaderContext";

interface PageHeaderProps {
  title: string;
  titleContent?: ReactNode;
  leading?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, titleContent, leading, toolbar, children }: PageHeaderProps) {
  const { setTitle, setTitleContent, leadingEl, actionsEl, toolbarEl } = usePageHeaderContext();

  useEffect(() => {
    setTitle(title);
    setTitleContent(titleContent ?? null);
    return () => {
      setTitle("");
      setTitleContent(null);
    };
  }, [title, titleContent, setTitle, setTitleContent]);

  return (
    <>
      {leadingEl && leading ? createPortal(leading, leadingEl) : null}
      {actionsEl && children ? createPortal(children, actionsEl) : null}
      {toolbarEl && toolbar ? createPortal(toolbar, toolbarEl) : null}
    </>
  );
}
