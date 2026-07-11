import type { ApiErrorResponse } from "@musiccloud/shared";
import { useCallback, useState } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { ShareLogoHeader } from "@/components/share/ShareLogoHeader";
import { EmbossedButton } from "@/components/ui/EmbossedButton";

interface ShareErrorLabels {
  back: string;
  code: string;
  copied: string;
  copy: string;
  description: string;
  reference: string;
  title: string;
}

interface ShareErrorShellProps {
  error: ApiErrorResponse;
  labels: ShareErrorLabels;
}

export function ShareErrorShell({ error, labels }: ShareErrorShellProps) {
  const [copied, setCopied] = useState(false);
  const copyDetails = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${error.error}\n${error.errorId}\n${error.message}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex-1 flex flex-col items-center px-[var(--mc-pad-card,0.75rem)] pt-content-safe pb-12"
    >
      <ShareLogoHeader />
      <div className="w-full max-w-2xl animate-fade-in">
        <EmbossedCard>
          <EmbossedCard.Header>
            <h1 className="text-center text-2xl font-semibold tracking-[-0.02em] text-text-primary">{labels.title}</h1>
          </EmbossedCard.Header>
          <EmbossedCard.Body className="flex flex-col gap-[var(--mc-gap-cards,1.5rem)]">
            <p className="text-center text-sm leading-relaxed text-text-secondary">{labels.description}</p>
            <RecessedCard>
              <RecessedCard.Body className="flex flex-col gap-[var(--mc-gap-rowitem,0.75rem)]">
                <p className="text-sm leading-relaxed text-text-primary">{error.message}</p>
                <dl className="grid gap-[var(--mc-gap-list,0.1875rem)] text-sm">
                  <div className="flex flex-col gap-[var(--mc-gap-list,0.1875rem)] sm:flex-row sm:justify-between">
                    <dt className="text-text-secondary">{labels.code}</dt>
                    <dd>
                      <code className="select-all break-all text-text-primary">{error.error}</code>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-[var(--mc-gap-list,0.1875rem)] sm:flex-row sm:justify-between">
                    <dt className="text-text-secondary">{labels.reference}</dt>
                    <dd>
                      <code className="select-all break-all text-text-primary">{error.errorId}</code>
                    </dd>
                  </div>
                </dl>
              </RecessedCard.Body>
            </RecessedCard>
          </EmbossedCard.Body>
          <EmbossedCard.Footer className="mt-[var(--mc-gap-cards,1.5rem)] grid gap-[var(--mc-gap-list,0.1875rem)] sm:grid-cols-2">
            <RecessedCard>
              <RecessedCard.Body>
                <EmbossedButton as="button" className="w-full" onClick={copyDetails}>
                  {copied ? labels.copied : labels.copy}
                </EmbossedButton>
              </RecessedCard.Body>
            </RecessedCard>
            <RecessedCard>
              <RecessedCard.Body>
                <EmbossedButton href="/" className="block w-full text-center">
                  {labels.back}
                </EmbossedButton>
              </RecessedCard.Body>
            </RecessedCard>
          </EmbossedCard.Footer>
        </EmbossedCard>
      </div>
    </main>
  );
}
