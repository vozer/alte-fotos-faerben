export type Curve = [number, number, number, number, number];

export interface Adjustments {
  intensity: number;
  brightness: number;
  warmth: number;
  hue: number;
  blackPoint: number;
  midtone: number;
  whitePoint: number;
  curves: { master: Curve; red: Curve; green: Curve; blue: Curve };
}

export interface RgbHistogram {
  red: number[];
  green: number[];
  blue: number[];
}

const identityCurve: Curve = [0, 64, 128, 192, 255];

export const defaultAdjustments: Adjustments = {
  intensity: 100,
  brightness: 100,
  warmth: 0,
  hue: 0,
  blackPoint: 0,
  midtone: 1,
  whitePoint: 255,
  curves: {
    master: [...identityCurve],
    red: [...identityCurve],
    green: [...identityCurve],
    blue: [...identityCurve],
  },
};

const curveX = [0, 64, 128, 192, 255] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function makeCurve(values: Curve): Uint8Array {
  const points = values.map((value) => clamp(value, 0, 255));
  return Uint8Array.from({ length: 256 }, (_, x) => {
    let segment = 0;
    while (segment < curveX.length - 2 && x > curveX[segment + 1]) segment += 1;
    const leftX = curveX[segment];
    const rightX = curveX[segment + 1];
    const amount = (x - leftX) / (rightX - leftX);
    return Math.round(points[segment] + (points[segment + 1] - points[segment]) * amount);
  });
}

function makeToneCurve(values: Adjustments): Uint8Array {
  const black = clamp(values.blackPoint, 0, 64);
  const white = Math.max(black + 1, clamp(values.whitePoint, 191, 255));
  const gamma = clamp(values.midtone, 0.2, 2);
  return Uint8Array.from({ length: 256 }, (_, value) => {
    const level = clamp((value - black) / (white - black), 0, 1);
    return Math.round(level ** (1 / gamma) * 255);
  });
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (!delta) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === red
    ? (green - blue) / delta + (green < blue ? 6 : 0)
    : max === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return [hue, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const part = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = lightness - chroma / 2;
  const rgb = hue < 60 ? [chroma, part, 0]
    : hue < 120 ? [part, chroma, 0]
      : hue < 180 ? [0, chroma, part]
        : hue < 240 ? [0, part, chroma]
          : hue < 300 ? [part, 0, chroma]
            : [chroma, 0, part];
  return rgb.map((value) => Math.round((value + offset) * 255)) as [number, number, number];
}

function isNeutral(values: Adjustments): boolean {
  return values.intensity === 100 && values.brightness === 100 && values.warmth === 0 && values.hue === 0 &&
    values.blackPoint === 0 && values.midtone === 1 && values.whitePoint === 255 &&
    (Object.values(values.curves) as Curve[]).every((curve) => curve.every((value, index) => value === identityCurve[index]));
}

export function adjustPixels(source: Uint8ClampedArray, values: Adjustments): Uint8ClampedArray {
  if (source.length % 4 !== 0) throw new Error("Das Bildformat ist ungültig.");
  if (isNeutral(values)) return source.slice();

  const tone = makeToneCurve(values);
  const master = makeCurve(values.curves.master);
  const redCurve = makeCurve(values.curves.red);
  const greenCurve = makeCurve(values.curves.green);
  const blueCurve = makeCurve(values.curves.blue);
  const brightness = clamp(values.brightness, 80, 120) / 100;
  const warmth = clamp(values.warmth, -100, 100) * 0.2;
  const intensity = clamp(values.intensity, 50, 150) / 100;
  const hueShift = clamp(values.hue, -180, 180);
  const output = new Uint8ClampedArray(source.length);

  for (let index = 0; index < source.length; index += 4) {
    const red = clamp(master[tone[source[index]]], 0, 255);
    const green = clamp(master[tone[source[index + 1]]], 0, 255);
    const blue = clamp(master[tone[source[index + 2]]], 0, 255);
    let r = clamp(redCurve[red] * brightness + warmth, 0, 255) / 255;
    let g = clamp(greenCurve[green] * brightness, 0, 255) / 255;
    let b = clamp(blueCurve[blue] * brightness - warmth, 0, 255) / 255;
    const [hue, saturation, lightness] = rgbToHsl(r, g, b);
    [r, g, b] = hslToRgb((hue + hueShift + 360) % 360, clamp(saturation * intensity, 0, 1), lightness);
    output[index] = r;
    output[index + 1] = g;
    output[index + 2] = b;
    output[index + 3] = source[index + 3];
  }
  return output;
}

export function histogram(source: Uint8ClampedArray, bins = 64): RgbHistogram {
  const result: RgbHistogram = {
    red: Array(bins).fill(0),
    green: Array(bins).fill(0),
    blue: Array(bins).fill(0),
  };
  for (let index = 0; index < source.length; index += 4) {
    result.red[Math.min(bins - 1, Math.floor(source[index] * bins / 256))] += 1;
    result.green[Math.min(bins - 1, Math.floor(source[index + 1] * bins / 256))] += 1;
    result.blue[Math.min(bins - 1, Math.floor(source[index + 2] * bins / 256))] += 1;
  }
  return result;
}
