import { lazy, Suspense } from "react";

import { AnalyticsLoadingFallback } from "@/components/AnalyticsLoadingFallback";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";

const AnalyticsSection = lazy(() => import("./AnalyticsSection").then((m) => ({ default: m.AnalyticsSection })));

export function AnalyticsPage() {
  const { messages } = useI18n();

  return (
    <PageLayout>
      <PageHeader title={messages.analytics.title} />
      <PageBody className="overflow-y-auto -mx-3 -mt-3 px-3 pt-3 pb-3">
        <Suspense fallback={<AnalyticsLoadingFallback />}>
          <AnalyticsSection />
        </Suspense>
      </PageBody>
    </PageLayout>
  );
}
