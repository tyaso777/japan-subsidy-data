export type ChartLabelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ChartLabelInput = {
  id: string;
  x: number;
  y: number;
  text: string;
  seriesIndex: number;
  pointIndex: number;
  anchor: "start" | "middle" | "end";
};

export type ChartLineSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type PositionedChartLabel = ChartLabelInput & {
  labelX: number;
  labelY: number;
  box: ChartLabelBounds;
  needsBackground: boolean;
};

const labelHeight = 14;
const characterWidth = 7;
const boxPaddingX = 3;

const overlaps = (left: ChartLabelBounds, right: ChartLabelBounds) =>
  left.left < right.right &&
  left.right > right.left &&
  left.top < right.bottom &&
  left.bottom > right.top;

const pointInside = (x: number, y: number, box: ChartLabelBounds) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

const pointOnSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) =>
  px >= Math.min(ax, bx) &&
  px <= Math.max(ax, bx) &&
  py >= Math.min(ay, by) &&
  py <= Math.max(ay, by);

const segmentIntersectsSegment = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) => {
  const first = cross(ax, ay, bx, by, cx, cy);
  const second = cross(ax, ay, bx, by, dx, dy);
  const third = cross(cx, cy, dx, dy, ax, ay);
  const fourth = cross(cx, cy, dx, dy, bx, by);
  if (first * second < 0 && third * fourth < 0) return true;
  if (first === 0 && pointOnSegment(cx, cy, ax, ay, bx, by)) return true;
  if (second === 0 && pointOnSegment(dx, dy, ax, ay, bx, by)) return true;
  if (third === 0 && pointOnSegment(ax, ay, cx, cy, dx, dy)) return true;
  return fourth === 0 && pointOnSegment(bx, by, cx, cy, dx, dy);
};

const segmentIntersectsBox = (segment: ChartLineSegment, box: ChartLabelBounds) => {
  if (pointInside(segment.x1, segment.y1, box) || pointInside(segment.x2, segment.y2, box)) return true;
  return [
    [box.left, box.top, box.right, box.top],
    [box.right, box.top, box.right, box.bottom],
    [box.right, box.bottom, box.left, box.bottom],
    [box.left, box.bottom, box.left, box.top],
  ].some(([x1, y1, x2, y2]) =>
    segmentIntersectsSegment(segment.x1, segment.y1, segment.x2, segment.y2, x1, y1, x2, y2));
};

const makeBox = (
  input: ChartLabelInput,
  labelX: number,
  labelY: number,
): ChartLabelBounds => {
  const width = Math.max(24, input.text.length * characterWidth + boxPaddingX * 2);
  const left = input.anchor === "start"
    ? labelX - boxPaddingX
    : input.anchor === "end"
      ? labelX - width + boxPaddingX
      : labelX - width / 2;
  return {
    left,
    top: labelY - labelHeight + 2,
    right: left + width,
    bottom: labelY + 2,
  };
};

const preferredOffsets = (seriesIndex: number) => {
  const preferences = [
    [-14, 18, -30, 34],
    [-29, 18, -14, 34],
    [18, -14, 34, -30],
    [33, -14, 18, -30],
  ];
  return preferences[seriesIndex % preferences.length];
};

export function layoutChartPointLabels(
  labels: ChartLabelInput[],
  segments: ChartLineSegment[],
  bounds: ChartLabelBounds,
): PositionedChartLabel[] {
  const positioned: PositionedChartLabel[] = [];

  for (const input of labels) {
    const candidates = preferredOffsets(input.seriesIndex).map((offsetY, candidateIndex) => {
      const labelX = input.x;
      const labelY = input.y + offsetY;
      const box = makeBox(input, labelX, labelY);
      const overflow =
        Math.max(0, bounds.left - box.left) +
        Math.max(0, box.right - bounds.right) +
        Math.max(0, bounds.top - box.top) +
        Math.max(0, box.bottom - bounds.bottom);
      const labelCollisions = positioned.filter((other) => overlaps(box, other.box)).length;
      const lineCollisions = segments.filter((segment) => segmentIntersectsBox(segment, box)).length;
      const pointCollisions = labels.filter((point) =>
        point.id !== input.id &&
        pointInside(point.x, point.y, {
          left: box.left - 4,
          top: box.top - 4,
          right: box.right + 4,
          bottom: box.bottom + 4,
        })).length;
      const collisionCount = labelCollisions + lineCollisions + pointCollisions;
      const score =
        overflow * 100_000 +
        labelCollisions * 10_000 +
        lineCollisions * 1_000 +
        pointCollisions * 800 +
        candidateIndex * 10;
      return { labelX, labelY, box, collisionCount, score };
    });
    const best = candidates.reduce((current, candidate) => candidate.score < current.score ? candidate : current);
    positioned.push({
      ...input,
      labelX: best.labelX,
      labelY: best.labelY,
      box: best.box,
      needsBackground: best.collisionCount > 0,
    });
  }

  return positioned;
}
