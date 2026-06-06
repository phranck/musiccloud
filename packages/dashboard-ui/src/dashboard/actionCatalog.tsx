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

import { type DashboardButtonSize, DashboardButtonVariant } from "./DashboardButtonTypes.js";

export const DashboardActionId = {
  Save: "save",
  Delete: "delete",
  Remove: "remove",
  Edit: "edit",
  Create: "create",
  Import: "import",
  Export: "export",
  Copy: "copy",
  Cancel: "cancel",
  Close: "close",
  Reject: "reject",
  Approve: "approve",
  Restore: "restore",
  PutOnHold: "putOnHold",
  Overwrite: "overwrite",
  Skip: "skip",
} as const;

export type DashboardActionId = (typeof DashboardActionId)[keyof typeof DashboardActionId];

export const DashboardActionStatus = {
  Idle: "idle",
  Busy: "busy",
} as const;

export type DashboardActionStatus = (typeof DashboardActionStatus)[keyof typeof DashboardActionStatus];
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

export const DashboardActions = {
  [DashboardActionId.Save]: {
    ariaBehavior: "visible-label",
    colorRole: "primary",
    icon: FloppyDiskIcon,
    labelKey: "common.save",
    size: "action",
    variant: DashboardButtonVariant.Primary,
  },
  [DashboardActionId.Delete]: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: TrashIcon,
    labelKey: "common.delete",
    size: "action",
    variant: DashboardButtonVariant.Danger,
  },
  [DashboardActionId.Remove]: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: XCircleIcon,
    labelKey: "common.remove",
    size: "action",
    variant: DashboardButtonVariant.Danger,
  },
  [DashboardActionId.Edit]: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: PencilSimpleIcon,
    labelKey: "common.edit",
    size: "action",
    variant: DashboardButtonVariant.Neutral,
  },
  [DashboardActionId.Create]: {
    ariaBehavior: "visible-label",
    colorRole: "primary",
    icon: PlusIcon,
    labelKey: "common.create",
    size: "action",
    variant: DashboardButtonVariant.Primary,
  },
  [DashboardActionId.Import]: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: DownloadSimpleIcon,
    labelKey: "common.import",
    size: "action",
    variant: DashboardButtonVariant.Neutral,
  },
  [DashboardActionId.Export]: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: UploadSimpleIcon,
    labelKey: "common.export",
    size: "action",
    variant: DashboardButtonVariant.Neutral,
  },
  [DashboardActionId.Copy]: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: CopyIcon,
    labelKey: "common.copy",
    size: "action",
    variant: DashboardButtonVariant.Neutral,
  },
  [DashboardActionId.Cancel]: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: XIcon,
    labelKey: "common.cancel",
    size: "action",
    variant: DashboardButtonVariant.Danger,
  },
  [DashboardActionId.Close]: {
    ariaBehavior: "icon-only-label",
    colorRole: "ghost",
    icon: XIcon,
    labelKey: "common.close",
    size: "action",
    variant: DashboardButtonVariant.Ghost,
  },
  [DashboardActionId.Reject]: {
    ariaBehavior: "visible-label",
    colorRole: "danger",
    icon: XCircleIcon,
    labelKey: "common.reject",
    size: "action",
    variant: DashboardButtonVariant.Danger,
  },
  [DashboardActionId.Approve]: {
    ariaBehavior: "visible-label",
    colorRole: "success",
    icon: CheckCircleIcon,
    labelKey: "common.approve",
    size: "action",
    variant: DashboardButtonVariant.Success,
  },
  [DashboardActionId.Restore]: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: ArrowCounterClockwiseIcon,
    labelKey: "common.restore",
    size: "action",
    variant: DashboardButtonVariant.Neutral,
  },
  [DashboardActionId.PutOnHold]: {
    ariaBehavior: "visible-label",
    colorRole: "warning",
    icon: PauseCircleIcon,
    labelKey: "common.putOnHold",
    size: "action",
    variant: DashboardButtonVariant.Warning,
  },
  [DashboardActionId.Overwrite]: {
    ariaBehavior: "visible-label",
    colorRole: "warning",
    icon: ArrowsClockwiseIcon,
    labelKey: "common.overwrite",
    size: "action",
    variant: DashboardButtonVariant.Warning,
  },
  [DashboardActionId.Skip]: {
    ariaBehavior: "visible-label",
    colorRole: "neutral",
    icon: SkipForwardIcon,
    labelKey: "common.skip",
    size: "action",
    variant: DashboardButtonVariant.Neutral,
  },
} as const satisfies Record<DashboardActionId, DashboardActionDefinition>;

export function getDashboardActionDefinition(action: DashboardActionId) {
  return DashboardActions[action];
}
