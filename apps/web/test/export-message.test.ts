import { describe, expect, it } from "vitest";
import { exportDoneMessage } from "../src/lib/export-message";

describe("exportDoneMessage", () => {
  it("names the file that was written, not the source", () => {
    expect(exportDoneMessage({ fileName: "sample-dashboard-edited.jpg", note: null })).toBe(
      "Exported sample-dashboard-edited.jpg",
    );
  });

  it("keeps the file name in the same toast as the editor's note", () => {
    expect(
      exportDoneMessage({
        fileName: "sample-clip-edit.webm",
        note: "This browser can't encode AAC audio for MP4, so it was saved as WebM instead.",
      }),
    ).toBe(
      "Exported sample-clip-edit.webm. This browser can't encode AAC audio for MP4, so it was saved as WebM instead.",
    );
  });
});
