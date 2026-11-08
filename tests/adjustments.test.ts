import { describe, expect, it } from "vitest";
import { adjustmentPlan, defaultAdjustments } from "../src/renderer/adjustments";

describe("photo adjustments", () => {
  it("keeps the Stable result unchanged at neutral values", () => {
    expect(adjustmentPlan(defaultAdjustments)).toEqual({
      filter: "none",
      overlay: null,
    });
  });

  it("limits values to the German slider ranges", () => {
    expect(adjustmentPlan({ intensity: 500, brightness: 0, warmth: 500 })).toEqual({
      filter: "saturate(1.5) brightness(0.8)",
      overlay: { color: "rgba(255, 145, 55, 1)", alpha: 0.24 },
    });
  });

  it("uses a cool overlay for values below neutral", () => {
    expect(adjustmentPlan({ intensity: 100, brightness: 100, warmth: -50 }).overlay).toEqual({
      color: "rgba(55, 130, 255, 1)",
      alpha: 0.12,
    });
  });
});
