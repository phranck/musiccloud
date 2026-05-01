import { describe, expect, it } from "vitest";
import { stripYouTubeTopicSuffix } from "@/lib/youtube-topic";

describe("stripYouTubeTopicSuffix", () => {
  it("strips the trailing ' - Topic' suffix", () => {
    expect(stripYouTubeTopicSuffix("White Lies - Topic")).toBe("White Lies");
    expect(stripYouTubeTopicSuffix("Cage The Elephant - Topic")).toBe("Cage The Elephant");
    expect(stripYouTubeTopicSuffix("Ghost - Topic")).toBe("Ghost");
  });

  it("leaves names without the suffix unchanged", () => {
    expect(stripYouTubeTopicSuffix("White Lies")).toBe("White Lies");
    expect(stripYouTubeTopicSuffix("Katy Perry")).toBe("Katy Perry");
    expect(stripYouTubeTopicSuffix("a-ha")).toBe("a-ha");
  });

  it("leaves names with 'Topic' in another position unchanged", () => {
    expect(stripYouTubeTopicSuffix("Topic")).toBe("Topic");
    expect(stripYouTubeTopicSuffix("Off Topic Band")).toBe("Off Topic Band");
    expect(stripYouTubeTopicSuffix("The Topic - Album")).toBe("The Topic - Album");
  });

  it("requires the canonical ' - Topic' shape (spaces around the dash)", () => {
    expect(stripYouTubeTopicSuffix("Foo-Topic")).toBe("Foo-Topic");
    expect(stripYouTubeTopicSuffix("Foo - topic")).toBe("Foo - topic");
    expect(stripYouTubeTopicSuffix("Foo -Topic")).toBe("Foo -Topic");
  });

  it("is idempotent", () => {
    const stripped = stripYouTubeTopicSuffix("White Lies - Topic");
    expect(stripYouTubeTopicSuffix(stripped)).toBe(stripped);
  });

  it("trims whitespace after stripping", () => {
    expect(stripYouTubeTopicSuffix("White Lies - Topic ")).toBe("White Lies");
  });
});
