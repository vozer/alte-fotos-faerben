import { describe, expect, it } from "vitest";
import { extractModelChroma, labToRgb, resizePlane, rgbToLab } from "../src/renderer/colorizer";

describe("DeOldify color pipeline", () => {
  it("converts neutral black and white to Lab lightness", () => {
    expect(rgbToLab(0, 0, 0).l).toBeCloseTo(0, 5);
    expect(rgbToLab(1, 1, 1).l).toBeCloseTo(100, 5);
  });

  it("reconstructs neutral Lab as gray", () => {
    const rgb = labToRgb(50, 0, 0);
    expect(rgb[0]).toBeCloseTo(rgb[1], 5);
    expect(rgb[1]).toBeCloseTo(rgb[2], 5);
    expect(rgb[0]).toBeGreaterThan(0.46);
    expect(rgb[0]).toBeLessThan(0.47);
  });

  it("area-resizes a plane without changing constant values", () => {
    const result = resizePlane(new Float32Array([37, 37, 37, 37]), 2, 2, 1, 1, "area");
    expect(result[0]).toBeCloseTo(37, 5);
  });

  it("cubic-resizes a plane without ringing constant values", () => {
    const result = resizePlane(new Float32Array([12, 12, 12, 12]), 2, 2, 4, 4, "cubic");
    expect([...result].every((value) => Math.abs(value - 12) < 0.001)).toBe(true);
  });

  it("keeps DDColor's predicted Lab color channels", () => {
    const result = extractModelChroma("ddcolor-tiny", new Float32Array([24, 8, -12, 4]), 2);
    expect([...result.a]).toEqual([24, 8]);
    expect([...result.b]).toEqual([-12, 4]);
  });

  it("converts DeOldify's RGB output into non-gray Lab color channels", () => {
    const result = extractModelChroma("deoldify-stable", new Float32Array([1, 0, 0]), 1);
    expect(result.a[0]).toBeCloseTo(80, 0);
    expect(result.b[0]).toBeCloseTo(67, 0);
  });
});
