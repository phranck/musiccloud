import { describe, expect, it } from "vitest";
import {
  type AvatarAccount,
  AvatarActionType,
  avatarReducer,
  heldPictures,
  initialAvatarState,
  withChosenSource,
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

describe("the picture on a profile", () => {
  it("offers a choice only between the pictures the account holds", () => {
    const one = initialAvatarState(makeAccount({ uploadedAvatarUrl: "data:image/png;base64,AA" }));
    const two = initialAvatarState(
      makeAccount({ uploadedAvatarUrl: "data:image/png;base64,AA", gravatarUrl: "https://www.gravatar.com/avatar/x" }),
    );

    expect(heldPictures(one)).toHaveLength(1);
    expect(heldPictures(two).map((entry) => entry.source)).toEqual([AvatarSource.Upload, AvatarSource.Gravatar]);
  });

  it("reads a source it does not know as no choice at all", () => {
    const state = initialAvatarState(makeAccount({ avatarSource: "somewhere-else" }));

    expect(state.source).toBeNull();
  });

  it("keeps the other pictures when one is chosen", () => {
    const state = initialAvatarState(
      makeAccount({
        uploadedAvatarUrl: "data:image/png;base64,AA",
        gravatarUrl: "https://www.gravatar.com/avatar/x",
        avatarSource: AvatarSource.Upload,
        avatarUrl: "data:image/png;base64,AA",
      }),
    );

    const chosen = withChosenSource(state, AvatarSource.Gravatar);

    expect(chosen.shown).toBe("https://www.gravatar.com/avatar/x");
    // Choosing is not discarding: the upload is still there to switch back to.
    expect(chosen.uploaded).toBe("data:image/png;base64,AA");
  });

  it("says what a lookup found, and says nothing of the sort after a store", () => {
    const account = makeAccount({ gravatarUrl: "https://www.gravatar.com/avatar/x", avatarSource: "gravatar" });

    const found = avatarReducer(initialAvatarState(makeAccount()), {
      type: AvatarActionType.Looked,
      account,
      found: true,
    });
    const missing = avatarReducer(initialAvatarState(makeAccount()), {
      type: AvatarActionType.Looked,
      account: makeAccount(),
      found: false,
    });
    const stored = avatarReducer(found, { type: AvatarActionType.Stored, account });

    expect(found.notice).toContain("Found one");
    expect(missing.notice).toContain("No Gravatar");
    expect(found.busy).toBe(false);
    // A store carries no answer about Gravatar, so the previous one is not
    // reworded into something it did not say.
    expect(stored.error).toBeNull();
  });

  it("clears the last failure when the next request starts", () => {
    const failed = avatarReducer(initialAvatarState(makeAccount()), {
      type: AvatarActionType.Failed,
      message: "Too large.",
    });
    const started = avatarReducer(failed, { type: AvatarActionType.Started });

    expect(failed.error).toBe("Too large.");
    expect(started.error).toBeNull();
    expect(started.busy).toBe(true);
  });
});
