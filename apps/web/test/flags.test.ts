import { describe, expect, it } from "vitest";
import { HOME_HEADLINES, homeHeadline } from "../src/lib/flags";

describe("homeHeadline", () => {
  it("shows the variant assigned by key, and the control for anything else", () => {
    expect(homeHeadline("local")).toBe(HOME_HEADLINES.local);
    expect(homeHeadline("control")).toBe(HOME_HEADLINES.control);
    expect(homeHeadline(undefined)).toBe(HOME_HEADLINES.control);
    expect(homeHeadline("<script>")).toBe(HOME_HEADLINES.control);
  });
});
