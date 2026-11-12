import {
  getMicroPositionInTube,
  getMicroRingCount,
  getMicroStrandColor,
  getMicroTubeColor,
  getMicroTubeNumber,
  describeMicroFiber,
  MICRO_TUBE_SIZE,
} from "@/lib/microFiber";

/** The black ring marks printed on the fiber coating (0, 1 or 2). */
export function RingMarks({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-[2px] ml-1 align-middle" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="inline-block h-[9px] w-[2px] rounded-sm bg-black ring-1 ring-white"
        />
      ))}
    </span>
  );
}

/** Tube badge — "T3" filled with that tube's colour. */
export function MicroTubeBadge({ tube }: { tube: number }) {
  const color = getMicroTubeColor(tube);
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded border border-black ${color.bg} ${color.text} font-mono font-semibold text-xs`}
      title={`Tube ${tube} (${color.name})`}
    >
      T{tube}
    </span>
  );
}

/**
 * Strand badge for micro-fiber mode — in-tube position (1..36) coloured by the
 * ring-marked 12-colour cycle, with the ring marks drawn alongside.
 */
export function MicroStrandBadge({
  fiber,
  tubeSize = MICRO_TUBE_SIZE,
}: {
  fiber: number;
  tubeSize?: number;
}) {
  const pos = getMicroPositionInTube(fiber, tubeSize);
  const rings = getMicroRingCount(pos);
  const color = getMicroStrandColor(pos);
  return (
    <span
      className={`inline-flex items-center px-1 py-0.5 rounded border border-black ${color.bg} ${color.text} font-mono font-semibold text-xs`}
      title={describeMicroFiber(fiber, tubeSize)}
    >
      {pos}
      <RingMarks count={rings} />
    </span>
  );
}

/** Convenience: the tube badge for an absolute fiber number. */
export function MicroTubeBadgeForFiber({
  fiber,
  tubeSize = MICRO_TUBE_SIZE,
}: {
  fiber: number;
  tubeSize?: number;
}) {
  return <MicroTubeBadge tube={getMicroTubeNumber(fiber, tubeSize)} />;
}
