import { ENDPOINTS, type Locale, type TranslationStatus } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface TranslationPayload {
  title: string;
  content: string;
}

export interface TranslationRow extends TranslationPayload {
  locale: Locale;
  sourceUpdatedAt: string | null;
  updatedAt: string;
}

export interface TranslationsResponse {
  statuses: Record<Locale, TranslationStatus>;
  translations: TranslationRow[];
}

export function usePageTranslations(slug: string) {
  return useQuery({
    queryKey: ["content-pages", slug, "translations"],
    queryFn: () => api.get<TranslationsResponse>(ENDPOINTS.admin.pages.translations.list(slug)),
    enabled: slug.length > 0,
  });
}

export function useDeleteTranslation(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locale: Locale) => api.delete<void>(ENDPOINTS.admin.pages.translations.detail(slug, locale)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-pages", slug, "translations"] });
      qc.invalidateQueries({ queryKey: ["content-pages", slug] });
      qc.invalidateQueries({ queryKey: ["content-pages"] });
    },
  });
}
