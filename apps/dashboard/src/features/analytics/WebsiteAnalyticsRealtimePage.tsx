import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";

export function WebsiteAnalyticsRealtimePage() {
  const { messages } = useI18n();

  return (
    <PageLayout>
      <PageHeader title={messages.layout.sidebar.websiteAnalyticsRealtime} />
      <PageBody className="overflow-y-auto -mx-3 -mt-3 px-3 pt-3 pb-3">
        <div className="min-h-[480px]" />
      </PageBody>
    </PageLayout>
  );
}
