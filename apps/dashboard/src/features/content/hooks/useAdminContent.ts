import {
  type ContentContextMask,
  type ContentPage,
  type ContentPageSummary,
  type ContentPublication,
  ENDPOINTS,
  type PageType,
} from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isEditableContentPage } from "@/features/content/editorialPageOwnership";
import { api } from "@/lib/api";

export type { ContentPage, ContentPageSummary } from "@musiccloud/shared";

export class SystemOwnedContentPageError extends Error {
  constructor() {
    super("System-owned documentation cannot be edited in the Page Editor.");
    this.name = "SystemOwnedContentPageError";
  }
}

export function useContentPages() {
  return useQuery({
    queryKey: ["content-pages"],
    queryFn: async () => {
      const pages = await api.get<ContentPageSummary[]>(ENDPOINTS.admin.pages.list);
      return pages.filter(isEditableContentPage);
    },
  });
}

export function useAdminContentPage(slug: string | undefined) {
  return useQuery({
    queryKey: ["content-pages", slug],
    queryFn: async () => {
      const page = await api.get<ContentPage>(ENDPOINTS.admin.pages.detail(slug!));
      if (!isEditableContentPage(page)) {
        throw new SystemOwnedContentPageError();
      }
      return page;
    },
    enabled: !!slug,
  });
}

export function useCreateContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      slug: string;
      pageType?: PageType;
      contextMask: ContentContextMask;
      publications: ContentPublication[];
    }) => api.post<ContentPage>(ENDPOINTS.admin.pages.list, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-pages"] }),
  });
}

export function useDeleteContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.delete(ENDPOINTS.admin.pages.detail(slug)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-pages"] }),
  });
}
