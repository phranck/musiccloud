import { ENDPOINTS, type Locale } from "@musiccloud/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

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
