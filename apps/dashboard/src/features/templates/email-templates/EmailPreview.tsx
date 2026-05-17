import { ENDPOINTS } from "@musiccloud/shared";
import { EyeIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { ThemeSegmentedControl } from "@/components/ui/ThemeSegmentedControl";
import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";

interface EmailPreviewProps {
  headerBannerUrl: string;
  headerText: string;
  bodyText: string;
  footerBannerUrl: string;
  footerText: string;
}

const COLOR_SCHEME_STORAGE_KEY = "email-template:preview-color-scheme";

function loadColorScheme(): "light" | "dark" {
  const saved = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  return saved === "dark" ? "dark" : "light";
}

/**
 * Live email preview rendered in an isolated iframe.
 * Fetches rendered HTML from the backend preview endpoint so the output is
 * always identical to what recipients receive.
 */
export function EmailPreview({
  headerBannerUrl,
  headerText,
  bodyText,
  footerBannerUrl,
  footerText,
}: EmailPreviewProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(loadColorScheme);
  const [srcDoc, setSrcDoc] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api
        .post<{ html: string }>(ENDPOINTS.admin.emailTemplates.preview, {
          headerBannerUrl: headerBannerUrl || null,
          headerText: headerText || null,
          bodyText,
          footerText: footerText || null,
          footerBannerUrl: footerBannerUrl || null,
          colorScheme,
        })
        .then(({ html }) => setSrcDoc(html))
        .catch(() => {});
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [headerBannerUrl, headerText, bodyText, footerText, footerBannerUrl, colorScheme]);

  return (
    <DashboardSection className="flex h-full min-h-0 flex-col overflow-hidden">
      <DashboardSection.Header
        icon={<EyeIcon weight="duotone" className="size-4" />}
        title={m.previewTitle}
        addOn={
          <ThemeSegmentedControl
            value={colorScheme}
            onChange={(value) => {
              if (value === "system") return;
              setColorScheme(value);
              localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, value);
            }}
            options={["light", "dark"]}
          />
        }
      />
      <DashboardSection.Body className="min-h-0 flex-1 !gap-0 !p-0">
        <iframe srcDoc={srcDoc} className="w-full h-full border-0" title={m.previewTitle} sandbox="allow-same-origin" />
      </DashboardSection.Body>
    </DashboardSection>
  );
}
