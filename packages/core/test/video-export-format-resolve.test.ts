import { describe, expect, it } from "vitest";
import {
  defaultVideoExportFormat,
  firstSupported,
  resolveDefaultVideoExportFormat,
  type ExportAudioCodec,
  type ExportVideoCodec,
} from "../src";

const AUDIO: readonly ExportAudioCodec[] = ["aac", "opus"];
const VIDEO: readonly ExportVideoCodec[] = ["avc", "vp9", "vp8", "av1"];

function subsets<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((all, item) => [...all, ...all.map((s) => [...s, item])], [[]]);
}

describe("firstSupported", () => {
  it("returns the first accepted candidate and asks no further", async () => {
    const asked: string[] = [];
    const found = await firstSupported(["a", "b", "c"], async (c) => {
      asked.push(c);
      return c !== "a";
    });
    expect(found).toBe("b");
    expect(asked).toEqual(["a", "b"]);
  });

  it("returns null when nothing is accepted", async () => {
    expect(await firstSupported([1, 2], async () => false)).toBeNull();
  });
});

describe("resolveDefaultVideoExportFormat", () => {
  it("matches defaultVideoExportFormat for every browser capability set", async () => {
    for (const hasAudio of [false, true]) {
      for (const audio of subsets(AUDIO)) {
        for (const video of subsets(VIDEO)) {
          const encodableAudio = new Set(audio);
          const encodableVideo = new Set(video);
          const resolved = await resolveDefaultVideoExportFormat({
            hasAudio,
            canEncodeAudio: async (codec) => encodableAudio.has(codec),
            canEncodeVideo: async (codec) => encodableVideo.has(codec),
          });
          expect(resolved).toBe(
            defaultVideoExportFormat({ hasAudio, encodableAudio, encodableVideo }),
          );
        }
      }
    }
  });

  it("asks only for MP4's codecs when MP4 works", async () => {
    const asked: string[] = [];
    const format = await resolveDefaultVideoExportFormat({
      hasAudio: true,
      canEncodeAudio: async (codec) => (asked.push(codec), true),
      canEncodeVideo: async (codec) => (asked.push(codec), true),
    });
    expect(format).toBe("mp4");
    expect(asked).toEqual(["aac", "avc"]);
  });

  it("skips the H.264 check when AAC can't be encoded (Chromium on Linux)", async () => {
    const asked: string[] = [];
    const format = await resolveDefaultVideoExportFormat({
      hasAudio: true,
      canEncodeAudio: async (codec) => (asked.push(codec), codec === "opus"),
      canEncodeVideo: async (codec) => (asked.push(codec), true),
    });
    expect(format).toBe("webm");
    expect(asked).toEqual(["aac", "opus", "vp9"]);
  });
});
