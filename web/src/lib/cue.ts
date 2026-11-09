// Marks elements for <Timeline>.
/** Attributes for an element that appears at [at] (0–1 of the run); with [draw], a path with pathLength 1 that draws over [len]. */
export function cue(at: number, draw?: { len: number }) {
  return draw
    ? { "data-at": at, "data-len": draw.len, strokeDasharray: 1, strokeDashoffset: 1 }
    : { "data-at": at, style: { opacity: 0 } };
}
