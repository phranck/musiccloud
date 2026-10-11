import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, useCallback, useRef } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  type AvatarAction,
  AvatarActionType,
  type AvatarState,
  heldPictures,
  shownPicture,
} from "@/lib/avatarPickerState";
import { AvatarSource, type AvatarSourceValue } from "@/lib/avatarSource";
import { Profile2UserIcon } from "@/lib/icons";

/** What the picture may be, matching what the backend accepts. */
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

/** What the picture may weigh once decoded, matching the backend's cap. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * How wide the picture and the controls under it are drawn.
 *
 * One width for the column, so the picture and every button below it line up
 * on both edges rather than each taking the width of its own content.
 */
const PICTURE_COLUMN = 160;

/** What each source is called where a developer chooses between them. */
const SOURCE_LABELS: Record<AvatarSourceValue, string> = {
  [AvatarSource.Upload]: "Uploaded",
  [AvatarSource.Gravatar]: "Gravatar",
  [AvatarSource.Provider]: "GitHub",
};

/** Props for {@link AvatarPicker}. */
export interface AvatarPickerProps {
  /** What the card is showing, which the form owns. */
  state: AvatarState;
  /** How the card reports what the developer did. */
  dispatch: (action: AvatarAction) => void;
}

/**
 * Reads a picked file as the `data:` URL the backend stores.
 *
 * @param file - What the developer chose.
 * @returns The data URL, or `null` where the file could not be read.
 */
function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * The picture on a developer's profile, with the three places it can come from.
 *
 * Nothing here is stored. A picked file is shown and held until the card is
 * saved, so choosing one and thinking better of it leaves the account as it
 * was. Checking Gravatar is the one thing that leaves the machine, and it only
 * reads: it asks whether the account has a picture and says so.
 *
 * @param props - See {@link AvatarPickerProps}.
 * @returns The picture column.
 */
export function AvatarPicker({ state, dispatch }: AvatarPickerProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const onPick = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (file.size > MAX_UPLOAD_BYTES) {
        dispatch({
          type: AvatarActionType.Failed,
          message: `A picture may be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
        });
        return;
      }

      const dataUrl = await readAsDataUrl(file);
      if (!dataUrl) {
        dispatch({ type: AvatarActionType.Failed, message: "That file could not be read." });
        return;
      }
      dispatch({ type: AvatarActionType.Picked, dataUrl });
    },
    [dispatch],
  );

  const onGravatar = useCallback(async () => {
    dispatch({ type: AvatarActionType.Looking });
    const response = await fetch(ENDPOINTS.dev.auth.gravatar, { method: "POST", credentials: "same-origin" });
    if (!response.ok) {
      dispatch({ type: AvatarActionType.Failed, message: "Gravatar could not be asked just now." });
      return;
    }
    const body = (await response.json().catch(() => null)) as { gravatarUrl?: string | null } | null;
    dispatch({ type: AvatarActionType.Looked, gravatarUrl: body?.gravatarUrl ?? null });
  }, [dispatch]);

  const shown = shownPicture(state);
  const held = heldPictures(state);
  const hasUpload = held.some((entry) => entry.source === AvatarSource.Upload);

  return (
    <div className="flex flex-col gap-3" style={{ width: PICTURE_COLUMN, flex: "none" }}>
      {shown ? (
        <img
          src={shown}
          alt=""
          width={PICTURE_COLUMN}
          height={PICTURE_COLUMN}
          className="rounded-button object-cover"
          style={{ width: PICTURE_COLUMN, height: PICTURE_COLUMN }}
        />
      ) : (
        // A picture nobody set still reads as a person rather than as a gap,
        // which is what an empty frame would look like.
        <div
          className="flex items-center justify-center rounded-button border border-border bg-surface text-fg-subtle"
          style={{ width: PICTURE_COLUMN, height: PICTURE_COLUMN }}
        >
          <Profile2UserIcon aria-hidden="true" style={{ width: PICTURE_COLUMN / 2, height: PICTURE_COLUMN / 2 }} />
        </div>
      )}

      <div className="flex flex-col items-stretch gap-2">
        <button
          type="button"
          className="button button--secondary"
          disabled={state.busy}
          onClick={() => fileInput.current?.click()}
        >
          Upload picture
        </button>
        <button type="button" className="button button--secondary" disabled={state.busy} onClick={onGravatar}>
          Check Gravatar
        </button>
        {hasUpload && (
          <button
            type="button"
            className="button button--secondary"
            disabled={state.busy}
            onClick={() => dispatch({ type: AvatarActionType.Removed })}
          >
            Remove picture
          </button>
        )}
      </div>

      {held.length > 1 && (
        <SegmentedControl role="group" aria-label="Which picture is shown">
          {held.map((entry) => (
            <SegmentedControl.Item
              key={entry.source}
              type="button"
              disabled={state.busy}
              aria-pressed={state.source === entry.source}
              data-state={state.source === entry.source ? "active" : undefined}
              onClick={() => dispatch({ type: AvatarActionType.Chose, source: entry.source })}
            >
              <SegmentedControl.Item.Label>{SOURCE_LABELS[entry.source]}</SegmentedControl.Item.Label>
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      )}

      {state.error && <p className="text-body text-danger">{state.error}</p>}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={onPick}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
