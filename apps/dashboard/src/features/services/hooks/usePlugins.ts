import type { PluginInfo, ServiceId } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchPlugins, patchPlugin } from "@/features/services/api";

const QUERY_KEY = ["admin", "plugins"] as const;

export function usePlugins() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPlugins,
  });
}

/**
 * Toggle a plugin's enabled state with optimistic update. Reverts on
 * error so the UI tracks the server's truth even when the write fails.
 */
export function useTogglePlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: ServiceId; enabled: boolean }) => patchPlugin(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const previous = qc.getQueryData<PluginInfo[]>(QUERY_KEY);
      if (previous) {
        qc.setQueryData<PluginInfo[]>(
          QUERY_KEY,
          previous.map((p) => (p.id === id ? { ...p, enabled } : p)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(QUERY_KEY, ctx.previous);
      }
    },
    onSuccess: (updated) => {
      const current = qc.getQueryData<PluginInfo[]>(QUERY_KEY);
      if (current) {
        qc.setQueryData<PluginInfo[]>(
          QUERY_KEY,
          current.map((p) => (p.id === updated.id ? updated : p)),
        );
      }
    },
  });
}
