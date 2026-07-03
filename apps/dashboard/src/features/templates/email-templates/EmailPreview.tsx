import type { EmailBlock } from "@musiccloud/shared";
import { ENDPOINTS } from "@musiccloud/shared";
import { EyeIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { ColorSchemeSegmentedControl } from "@/components/ui/ColorSchemeSegmentedControl";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";
import type { EmailTemplateBranding } from "@/shared/contracts/admin-email-templates";

interface EmailPreviewProps {
  /** The template body's ordered blocks. */
  blocks: EmailBlock[];
  /**
   * The template's (possibly still-unsaved) branding overrides. Sent with the
   * preview request so the iframe reflects the day/night background and any
   * header/footer/text override live, resolved over the global default exactly
   * as the send path would.
   */
  branding: EmailTemplateBranding;
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
export function EmailPreview({ blocks, branding }: EmailPreviewProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(loadColorScheme);
  const [srcDoc, setSrcDoc] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api
        .post<{ html: string }>(ENDPOINTS.admin.emailTemplates.preview, { blocks, colorScheme, branding })
        .then(({ html }) => setSrcDoc(html))
        .catch(() => {});
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [blocks, colorScheme, branding]);

  return (
    <DashboardSection className="flex h-full min-h-0 flex-col overflow-hidden">
      <DashboardSection.Header
        icon={<EyeIcon weight="duotone" className="size-4" />}
        title={m.previewTitle}
        renderAddOn={() => (
          <ColorSchemeSegmentedControl
            value={colorScheme}
            onChange={(value) => {
              setColorScheme(value);
              localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, value);
            }}
          />
        )}
      />
      <DashboardSection.Body className="min-h-0 flex-1 !gap-0 !p-0">
        <iframe srcDoc={srcDoc} className="w-full h-full border-0" title={m.previewTitle} sandbox="allow-same-origin" />
      </DashboardSection.Body>
    </DashboardSection>
  );
}
