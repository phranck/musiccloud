import { describe, expect, it } from "vitest";
import { artistCopy } from "@/copy/artist";
import { commonCopy } from "@/copy/common";
import { discoveryCopy } from "@/copy/discovery";
import { resultsCopy } from "@/copy/results";
import { shareCopy } from "@/copy/share";

describe("typed English frontend copy", () => {
  it("preserves direct English values without string-key lookup", () => {
    expect(commonCopy.a11y.skipToContent).toBe("Skip to content");
    expect(discoveryCopy.disambiguation.title).toBe("Did you mean?");
    expect(resultsCopy.listenOn).toBe("Listen on");
  });

  it("interpolates domain values through typed functions", () => {
    expect(discoveryCopy.disambiguation.found(3)).toBe("Found 3 possible matches. Please select the correct one.");
    expect(resultsCopy.albumTracks(12)).toBe("12 tracks");
    expect(shareCopy.nativeShare("Blue in Green")).toBe('Share "Blue in Green"');
    expect(artistCopy.statusError("MC-API-0001")).toBe("ARTIST DATA ERROR MC-API-0001");
  });
});
