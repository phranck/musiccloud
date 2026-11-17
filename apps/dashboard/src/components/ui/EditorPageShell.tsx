import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { Toolbar } from "@/components/ui/Toolbar";

function cx(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

interface EditorPageShellProps {
  title: string;
  titleContent?: ReactNode;
  backLabel: string;
  onBack: () => void;
  headerContent?: ReactNode;
  children: ReactNode;
  toolbar?: ReactNode;
  bodyClassName?: string;
  cardClassName?: string;
  /**
   * Whether the children stand directly in the scrolling page body instead of
   * inside one card, for an editor whose children are sections that each draw
   * their own surface. `false` by default, which wraps them in the card.
   */
  noCard?: boolean;
}

export function EditorPageShell({
  title,
  titleContent,
  backLabel,
  onBack,
  headerContent,
  children,
  toolbar,
  bodyClassName,
  cardClassName,
  noCard = false,
}: EditorPageShellProps) {
  return (
    <PageLayout>
      <PageHeader
        title={title}
        titleContent={titleContent}
        renderLeading={() => <HeaderBackButton label={backLabel} onClick={onBack} />}
      >
        {headerContent}
      </PageHeader>

      <PageBody className={cx("min-h-0 mb-3", noCard ? "overflow-y-auto" : undefined, bodyClassName)}>
        {noCard ? (
          children
        ) : (
          <Card className={cx("flex-1 min-h-0 overflow-y-auto p-5", cardClassName)}>{children}</Card>
        )}
      </PageBody>

      {toolbar ? <Toolbar className="sticky bottom-0 z-20 justify-end">{toolbar}</Toolbar> : null}
    </PageLayout>
  );
}
