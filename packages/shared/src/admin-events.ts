/**
 * @file The live events the backend sends to the admin dashboard.
 *
 * The backend writes each event to the `ENDPOINTS.admin.events` stream with
 * its `type` as the event name and its `data` as JSON, and the dashboard reads
 * them back. Both sides take the names and the payload from here, so an event
 * one side sends is an event the other side knows. Only events that something
 * sends are listed.
 */

import { isOneOf } from "./content.js";

/** The admin events the backend sends. */
export const AdminEventType = {
  /** Tracks were deleted, by any admin session. */
  TracksDeleted: "tracks-deleted",
  /** Albums were deleted, by any admin session. */
  AlbumsDeleted: "albums-deleted",
  /** Artist profiles were deleted, by any admin session. */
  ArtistsDeleted: "artists-deleted",
} as const;

export type AdminEventType = (typeof AdminEventType)[keyof typeof AdminEventType];

export const ADMIN_EVENT_TYPES: readonly AdminEventType[] = [
  AdminEventType.TracksDeleted,
  AdminEventType.AlbumsDeleted,
  AdminEventType.ArtistsDeleted,
] as const;

/**
 * What a deletion event carries.
 *
 * @property count - How many rows the deletion was asked to remove.
 * @property ids - The ids of those rows, so an open list can drop them.
 */
export interface AdminRowsDeletedPayload {
  count: number;
  ids: string[];
}

/** One admin event as it travels over the stream. */
export interface AdminEvent {
  type: AdminEventType;
  data: AdminRowsDeletedPayload;
}

/**
 * Whether a received event name and payload form an event the dashboard
 * knows. The stream is read as text, so neither is trusted until this says
 * so.
 *
 * @param type - The event name from the stream.
 * @param data - The parsed JSON payload.
 * @returns `true` for a known name with a payload of the right shape.
 */
export function isAdminEvent(type: string, data: unknown): boolean {
  if (!isOneOf(ADMIN_EVENT_TYPES, type) || typeof data !== "object" || data === null) return false;
  const { count, ids } = data as Partial<AdminRowsDeletedPayload>;
  return typeof count === "number" && Array.isArray(ids) && ids.every((id) => typeof id === "string");
}
