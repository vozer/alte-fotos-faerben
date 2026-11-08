import { describe, expect, it } from "vitest";
import { adjustPixels, defaultAdjustments, histogram } from "../src/renderer/adjustments";

describe("photo adjustments", () => {
  it("preserves every pixel and alpha at neutral settings", () => {
    const source = new Uint8ClampedArray([255, 22, 3, 127, 0, 0, 0, 0]);
    expect([...adjustPixels(source, defaultAdjustments)]).toEqual([...source]);
  });

  it("rotates hue without changing transparency", () => {
    const source = new Uint8ClampedArray([255, 0, 0, 127]);
    expect([...adjustPixels(source, { ...defaultAdjustments, hue: 120 })]).toEqual([0, 255, 0, 127]);
  });

  it("applies black and white points to the expected range", () => {
    const source = new Uint8ClampedArray([50, 128, 230, 255]);
    const result = adjustPixels(source, { ...defaultAdjustments, blackPoint: 64, whitePoint: 200 });
    expect([...result]).toEqual([0, 120, 255, 255]);
  });

  it("applies the selected channel curve independently", () => {
    const source = new Uint8ClampedArray([64, 64, 64, 255]);
    const adjustments = structuredClone(defaultAdjustments);
    adjustments.curves.red = [0, 128, 128, 192, 255];
    expect([...adjustPixels(source, adjustments)]).toEqual([128, 64, 64, 255]);
  });

  it("counts RGB values in the histogram without counting alpha", () => {
    const result = histogram(new Uint8ClampedArray([0, 128, 255, 0, 255, 0, 0, 255]));
    expect(result.red.reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(result.green.reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(result.blue.reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(result.red[0]).toBe(1);
    expect(result.red.at(-1)).toBe(1);
  });
});
