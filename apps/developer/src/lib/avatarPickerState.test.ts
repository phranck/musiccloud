import { describe, expect, it } from "vitest";
import {
  type AvatarAccount,
  AvatarActionType,
  avatarChanges,
  avatarReducer,
  heldPictures,
  initialAvatarState,
  shownPicture,
} from "@/lib/avatarPickerState";
import { AvatarSource } from "@/lib/avatarSource";

function makeAccount(overrides: Partial<AvatarAccount> = {}): AvatarAccount {
  return {
    avatarUrl: null,
    uploadedAvatarUrl: null,
    gravatarUrl: null,
    providerAvatarUrl: null,
    avatarSource: null,
    ...overrides,
  };
}

describe("the picture on a profile, before it is saved", () => {
  it("shows a picked picture without asking for anything to be stored", () => {
    const account = makeAccount();
    const picked = avatarReducer(initialAvatarState(account), {
      type: AvatarActionType.Picked,
      dataUrl: "data:image/png;base64,AA",
    });

    expect(shownPicture(picked)).toBe("data:image/png;base64,AA");
    // Picking is choosing, and the save is what carries it to the account.
    expect(avatarChanges(picked, account)).toEqual({
      upload: "data:image/png;base64,AA",
      avatarSource: AvatarSource.Upload,
    });
  });

  it("sends nothing about the picture where the picture was left alone", () => {
    const account = makeAccount({ uploadedAvatarUrl: "data:image/png;base64,AA", avatarSource: "upload" });

    expect(avatarChanges(initialAvatarState(account), account)).toEqual({});
  });

  it("asks for a removal only where there is something stored to remove", () => {
    const withUpload = makeAccount({ uploadedAvatarUrl: "data:image/png;base64,AA", avatarSource: "upload" });
    const withoutUpload = makeAccount();

    const removedStored = avatarReducer(initialAvatarState(withUpload), { type: AvatarActionType.Removed });
    const removedNothing = avatarReducer(initialAvatarState(withoutUpload), { type: AvatarActionType.Removed });

    expect(avatarChanges(removedStored, withUpload)).toEqual({ remove: true, avatarSource: null });
    expect(avatarChanges(removedNothing, withoutUpload)).toEqual({});
    expect(shownPicture(removedStored)).toBeNull();
  });

  it("carries what a lookup found into what a save would send", () => {
    const account = makeAccount();
    const found = avatarReducer(initialAvatarState(account), {
      type: AvatarActionType.Looked,
      gravatarUrl: "https://2.gravatar.com/avatar/abc",
    });
    const missing = avatarReducer(initialAvatarState(account), { type: AvatarActionType.Looked, gravatarUrl: null });

    expect(shownPicture(found)).toBe("https://2.gravatar.com/avatar/abc");
    expect(avatarChanges(found, account)).toEqual({
      gravatarUrl: "https://2.gravatar.com/avatar/abc",
      avatarSource: AvatarSource.Gravatar,
    });
    // Nothing found is nothing to save, so the button stays where it was.
    expect(avatarChanges(missing, account)).toEqual({});
  });

  it("offers a choice only between the pictures it holds", () => {
    const one = initialAvatarState(makeAccount({ uploadedAvatarUrl: "data:image/png;base64,AA" }));
    const two = initialAvatarState(
      makeAccount({ uploadedAvatarUrl: "data:image/png;base64,AA", gravatarUrl: "https://2.gravatar.com/avatar/abc" }),
    );

    expect(heldPictures(one)).toHaveLength(1);
    expect(heldPictures(two).map((entry) => entry.source)).toEqual([AvatarSource.Upload, AvatarSource.Gravatar]);
  });

  it("keeps the other pictures when one is chosen", () => {
    const account = makeAccount({
      uploadedAvatarUrl: "data:image/png;base64,AA",
      gravatarUrl: "https://2.gravatar.com/avatar/abc",
      avatarSource: "upload",
    });
    const chosen = avatarReducer(initialAvatarState(account), {
      type: AvatarActionType.Chose,
      source: AvatarSource.Gravatar,
    });

    expect(shownPicture(chosen)).toBe("https://2.gravatar.com/avatar/abc");
    // Choosing is not discarding: the upload is still there to switch back to.
    expect(heldPictures(chosen)).toHaveLength(2);
  });

  it("has nothing left to send once the save came back", () => {
    const before = makeAccount();
    const picked = avatarReducer(initialAvatarState(before), {
      type: AvatarActionType.Picked,
      dataUrl: "data:image/png;base64,AA",
    });
    const after = makeAccount({
      uploadedAvatarUrl: "data:image/png;base64,AA",
      avatarUrl: "data:image/png;base64,AA",
      avatarSource: "upload",
    });
    const saved = avatarReducer(picked, { type: AvatarActionType.Saved, account: after });

    expect(avatarChanges(saved, after)).toEqual({});
  });

  it("reads a source it does not know as no choice at all", () => {
    expect(initialAvatarState(makeAccount({ avatarSource: "somewhere-else" })).source).toBeNull();
  });

  it("clears the last failure when the next lookup starts", () => {
    const failed = avatarReducer(initialAvatarState(makeAccount()), {
      type: AvatarActionType.Failed,
      message: "Too large.",
    });
    const looking = avatarReducer(failed, { type: AvatarActionType.Looking });

    expect(failed.error).toBe("Too large.");
    expect(looking.error).toBeNull();
    expect(looking.busy).toBe(true);
  });
});
