import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  type IconProps,
  PauseCircleIcon,
  PencilSimpleIcon,
  PlusIcon,
  SkipForwardIcon,
  TrashIcon,
  UploadSimpleIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { DashboardButtonSize, DashboardButtonVariant } from "./DashboardButton.js";

export type DashboardActionStatus = "idle" | "busy";
export type DashboardActionColorRole =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "filled"
  | "accent"
  | "ghost"
  | "review";
export type DashboardActionAriaBehavior = "visible-label" | "icon-only-label";
export type DashboardActionLabelKey = `common.${string}`;
export type DashboardActionIcon = ComponentType<IconProps>;

export interface DashboardActionDefinition {
  ariaBehavior: DashboardActionAriaBehavior;
  colorRole: DashboardActionColorRole;
  icon: DashboardActionIcon;
  labelKey: DashboardActionLabelKey;
  size: DashboardButtonSize;
  variant: DashboardButtonVariant;
}

export const DASHBOARD_ACTIONS = {
  save: {
    ariaBehavior: "visible-label",
    colorRole: "primary",
    icon: FloppyDiskIcon,
    labelKey: "common.save",
    size: "action",
    variant: "primary",
  },
  delete: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: TrashIcon,
    labelKey: "common.delete",
    size: "action",
    variant: "danger",
  },
  remove: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: XCircleIcon,
    labelKey: "common.remove",
    size: "action",
    variant: "danger",
  },
  edit: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: PencilSimpleIcon,
    labelKey: "common.edit",
    size: "action",
    variant: "neutral",
  },
  create: {
    ariaBehavior: "visible-label",
    colorRole: "primary",
    icon: PlusIcon,
    labelKey: "common.create",
    size: "action",
    variant: "primary",
  },
  import: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: DownloadSimpleIcon,
    labelKey: "common.import",
    size: "action",
    variant: "neutral",
  },
  export: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: UploadSimpleIcon,
    labelKey: "common.export",
    size: "action",
    variant: "neutral",
  },
  copy: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: CopyIcon,
    labelKey: "common.copy",
    size: "action",
    variant: "neutral",
  },
  cancel: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: XIcon,
    labelKey: "common.cancel",
    size: "action",
    variant: "danger",
  },
  close: {
    ariaBehavior: "icon-only-label",
    colorRole: "ghost",
    icon: XIcon,
    labelKey: "common.close",
    size: "action",
    variant: "ghost",
  },
  reject: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: XCircleIcon,
    labelKey: "common.reject",
    size: "action",
    variant: "danger",
  },
  approve: {
    ariaBehavior: "visible-label",
    colorRole: "success",
    icon: CheckCircleIcon,
    labelKey: "common.approve",
    size: "action",
    variant: "success",
  },
  restore: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: ArrowCounterClockwiseIcon,
    labelKey: "common.restore",
    size: "action",
    variant: "neutral",
  },
  putOnHold: {
    ariaBehavior: "visible-label",
    colorRole: "warning",
    icon: PauseCircleIcon,
    labelKey: "common.putOnHold",
    size: "action",
    variant: "warning",
  },
  overwrite: {
    ariaBehavior: "visible-label",
    colorRole: "warning",
    icon: ArrowsClockwiseIcon,
    labelKey: "common.overwrite",
    size: "action",
    variant: "warning",
  },
  skip: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: SkipForwardIcon,
    labelKey: "common.skip",
    size: "action",
    variant: "neutral",
  },
} as const satisfies Record<string, DashboardActionDefinition>;

export type DashboardActionId = keyof typeof DASHBOARD_ACTIONS;

export function getDashboardActionDefinition(action: DashboardActionId) {
  return DASHBOARD_ACTIONS[action];
}
