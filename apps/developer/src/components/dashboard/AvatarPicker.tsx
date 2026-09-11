import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, useCallback, useReducer, useRef } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { sendAuth } from "@/lib/authClient";
import {
  type AvatarAccount,
  AvatarActionType,
  avatarReducer,
  heldPictures,
  initialAvatarState,
  withChosenSource,
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
  /** The account's pictures as the page rendered them. */
  account: AvatarAccount;
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
 * Checking Gravatar is a button rather than something this does on its own,
 * because the request tells a third party that this address holds an account
 * here. The chooser appears only where there is something to choose between.
 *
 * @param props - See {@link AvatarPickerProps}.
 * @returns The picture column.
 */
export function AvatarPicker({ account }: AvatarPickerProps) {
  const [state, dispatch] = useReducer(avatarReducer, account, initialAvatarState);
  const fileInput = useRef<HTMLInputElement>(null);

  const onPick = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
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

    dispatch({ type: AvatarActionType.Started });
    const response = await fetch(ENDPOINTS.dev.auth.avatar, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
      credentials: "same-origin",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      dispatch({ type: AvatarActionType.Failed, message: body?.message ?? "The picture could not be stored." });
      return;
    }
    const body = (await response.json().catch(() => null)) as { account?: AvatarAccount } | null;
    if (body?.account) dispatch({ type: AvatarActionType.Stored, account: body.account });
  }, []);

  const onRemove = useCallback(async () => {
    dispatch({ type: AvatarActionType.Started });
    const response = await fetch(ENDPOINTS.dev.auth.avatar, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) {
      dispatch({ type: AvatarActionType.Failed, message: "The picture could not be removed." });
      return;
    }
    const body = (await response.json().catch(() => null)) as { account?: AvatarAccount } | null;
    if (body?.account) dispatch({ type: AvatarActionType.Stored, account: body.account });
  }, []);

  const onGravatar = useCallback(async () => {
    dispatch({ type: AvatarActionType.Started });
    const response = await fetch(ENDPOINTS.dev.auth.gravatar, { method: "POST", credentials: "same-origin" });
    if (!response.ok) {
      dispatch({ type: AvatarActionType.Failed, message: "Gravatar could not be asked just now." });
      return;
    }
    const body = (await response.json().catch(() => null)) as { found?: boolean; account?: AvatarAccount } | null;
    if (body?.account) {
      dispatch({ type: AvatarActionType.Looked, account: body.account, found: Boolean(body.found) });
    }
  }, []);

  const onSource = useCallback(
    async (source: AvatarSourceValue) => {
      dispatch({ type: AvatarActionType.Started });
      const result = await sendAuth("PATCH", ENDPOINTS.dev.auth.profile, { avatarSource: source });
      if (!result.ok) {
        dispatch({ type: AvatarActionType.Failed, message: result.message ?? "That choice could not be saved." });
        return;
      }
      const chosen = withChosenSource(state, source);
      dispatch({
        type: AvatarActionType.Stored,
        account: {
          avatarUrl: chosen.shown,
          uploadedAvatarUrl: chosen.uploaded,
          gravatarUrl: chosen.gravatar,
          providerAvatarUrl: chosen.provider,
          avatarSource: chosen.source,
        },
      });
    },
    [state],
  );

  const held = heldPictures(state);

  return (
    <div className="flex flex-col gap-3" style={{ width: PICTURE_COLUMN, flex: "none" }}>
      {state.shown ? (
        <img
          src={state.shown}
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
          Upload a picture
        </button>
        <button type="button" className="button button--secondary" disabled={state.busy} onClick={onGravatar}>
          Check Gravatar
        </button>
        {state.uploaded && (
          <button type="button" className="button button--secondary" disabled={state.busy} onClick={onRemove}>
            Remove the upload
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
              onClick={() => onSource(entry.source)}
            >
              <SegmentedControl.Item.Label>{SOURCE_LABELS[entry.source]}</SegmentedControl.Item.Label>
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      )}

      {state.notice && <p className="text-body text-fg-muted">{state.notice}</p>}
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
