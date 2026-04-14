import { ENDPOINTS, type PluginInfo, type ServiceId } from "@musiccloud/shared";

import { api } from "@/lib/api";

export function fetchPlugins(): Promise<PluginInfo[]> {
  return api.get<PluginInfo[]>(ENDPOINTS.admin.plugins.list);
}

export function patchPlugin(id: ServiceId, enabled: boolean): Promise<PluginInfo> {
  return api.patch<PluginInfo>(ENDPOINTS.admin.plugins.detail(id), { enabled });
}
