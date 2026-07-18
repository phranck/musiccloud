import { ENDPOINTS, type NavigationConfiguration, type NavigationConfigurationInput } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

const NAVIGATION_CONFIGURATION_QUERY_KEY = ["admin-navigation-configuration"] as const;

/** Fetches the one canonical contextual navigation configuration. */
export function useAdminNavigationConfiguration() {
  return useQuery({
    queryKey: NAVIGATION_CONFIGURATION_QUERY_KEY,
    queryFn: () => api.get<NavigationConfiguration>(ENDPOINTS.admin.navigations.configuration),
  });
}

/** Replaces every contextual navigation entry and placement atomically. */
export function useSaveNavigationConfiguration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (configuration: NavigationConfigurationInput) =>
      api.put<NavigationConfiguration>(ENDPOINTS.admin.navigations.configuration, configuration),
    onSuccess: (configuration) => {
      queryClient.setQueryData(NAVIGATION_CONFIGURATION_QUERY_KEY, configuration);
      queryClient.invalidateQueries({ queryKey: ["admin-nav"] });
      queryClient.invalidateQueries({ queryKey: ["nav"] });
    },
  });
}
