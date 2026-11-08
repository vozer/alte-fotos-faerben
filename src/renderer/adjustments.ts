export interface Adjustments {
  intensity: number;
  brightness: number;
  warmth: number;
}

export interface AdjustmentPlan {
  filter: string;
  overlay: { color: string; alpha: number } | null;
}

export const defaultAdjustments: Adjustments = {
  intensity: 100,
  brightness: 100,
  warmth: 0,
};

export function adjustmentPlan(values: Adjustments): AdjustmentPlan {
  const intensity = Math.min(150, Math.max(50, values.intensity));
  const brightness = Math.min(120, Math.max(80, values.brightness));
  const warmth = Math.min(100, Math.max(-100, values.warmth));
  if (intensity === 100 && brightness === 100 && warmth === 0) {
    return { filter: "none", overlay: null };
  }
  const overlay = warmth === 0
    ? null
    : {
        color: warmth > 0 ? "rgba(255, 145, 55, 1)" : "rgba(55, 130, 255, 1)",
        alpha: (Math.abs(warmth) / 100) * 0.24,
      };
  return {
    filter: "saturate(" + intensity / 100 + ") brightness(" + brightness / 100 + ")",
    overlay,
  };
}
