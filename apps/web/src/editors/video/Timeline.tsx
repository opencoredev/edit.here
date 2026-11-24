import {
  clamp,
  findSegmentAt,
  formatTimecode,
  nudgeTrimEdge,
  snapTrimEdge,
  type TrimEdge,
  type VideoSegment,
  type VideoTrim,
} from "@edit-here/core";
import type { InputAudioTrack, InputVideoTrack } from "mediabunny";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useFilmstrip, useWaveform } from "./media-previews";
import { usePlayhead, usePlayheadSelector, type PlayheadStore } from "./playhead";

const STRIP_HEIGHT = 56;
const WAVE_HEIGHT = 22;
const WAVE_BUCKETS = 600;

/** Diagonal hatch over cut segments, mixed from the theme canvas so it follows color mode. */
const CUT_HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in srgb, var(--neutral-1) 82%, transparent) 0 5px, color-mix(in srgb, var(--neutral-1) 60%, transparent) 5px 10px)",
} as const;

export type ScrubPhase = "start" | "move" | "end";

export type { TrimEdge };

/** The kept span the trim handles sit on, in source seconds. */
export type TrimBounds = VideoTrim;

type TimelineProps = {
  readonly duration: number;
  readonly frameRate: number;
  readonly segments: readonly VideoSegment[];
  readonly playhead: PlayheadStore;
  /** The opened file, which the filmstrip worker demuxes on its own. */
  readonly file: File;
  readonly videoTrack: InputVideoTrack;
  readonly audioTrack: InputAudioTrack | null;
  /** Source width over height, for thumbnail tiles. */
  readonly aspect: number;
  /** Short summary shown between the start and end times. */
  readonly caption?: string;
  /** Playback controls shown above the track. */
  readonly transport?: ReactNode;
  /** Where the in and out handles sit, or null when every segment is cut. */
  readonly trim: TrimBounds | null;
  /** Dims the waveform, e.g. while the audio is muted. */
  readonly audioDimmed?: boolean;
  readonly onScrub: (time: number, phase: ScrubPhase) => void;
  /** A handle drag: live on start and move, committed on end (one undo step). */
  readonly onTrim: (edge: TrimEdge, time: number, phase: ScrubPhase) => void;
  readonly onToggleSegment: (id: string) => void;
};

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function percent(time: number, duration: number): string {
  return `${(clamp(time / duration, 0, 1) * 100).toFixed(4)}%`;
}

/** Filmstrip tiles drawn into one canvas that spans the track. */
const Filmstrip = memo(function Filmstrip(props: {
  readonly file: File;
  readonly track: InputVideoTrack;
  readonly duration: number;
  readonly width: number;
  readonly aspect: number;
}) {
  const { file, track, duration, width, aspect } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const idealTile = STRIP_HEIGHT * clamp(aspect, 0.4, 3);
  const count = width > 0 ? clamp(Math.ceil(width / idealTile), 3, 48) : 0;
  // Decode at a fixed tile size per count so resizing a few pixels doesn't re-decode.
  const tileWidth = count > 0 ? Math.ceil((idealTile * dpr) / 8) * 8 : 0;
  const tiles = useFilmstrip({
    file,
    track,
    duration,
    count,
    tileWidth,
    tileHeight: Math.round(STRIP_HEIGHT * dpr),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || width === 0 || count === 0) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(STRIP_HEIGHT * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const slot = canvas.width / count;
    for (const tile of tiles) {
      // Center-crop each bitmap into its slot so tiles never stretch.
      const sw = Math.min(tile.bitmap.width, (slot / canvas.height) * tile.bitmap.height);
      const sx = (tile.bitmap.width - sw) / 2;
      ctx.drawImage(
        tile.bitmap,
        sx,
        0,
        sw,
        tile.bitmap.height,
        tile.index * slot,
        0,
        Math.ceil(slot),
        canvas.height,
      );
    }
  }, [tiles, width, count, dpr]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-x-0 top-0 w-full bg-n3"
      style={{ height: STRIP_HEIGHT }}
    />
  );
});

function wavePath(peaks: Float32Array): string {
  let max = 0;
  for (const value of peaks) max = Math.max(max, value);
  const scale = max > 0 ? 1 / max : 0;
  let path = "";
  peaks.forEach((value, i) => {
    const h = Math.max(0.02, value * scale);
    path += `M${i} ${(1 - h) / 2}h0.7v${h}h-0.7z`;
  });
  return path;
}

const Waveform = memo(function Waveform(props: {
  readonly track: InputAudioTrack;
  readonly duration: number;
  readonly dimmed: boolean;
}) {
  const peaks = useWaveform({
    track: props.track,
    duration: props.duration,
    buckets: WAVE_BUCKETS,
  });
  const path = useMemo(() => (peaks === null ? null : wavePath(peaks)), [peaks]);
  if (path === null) return null;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WAVE_BUCKETS} 1`}
      preserveAspectRatio="none"
      className={`absolute inset-x-0 bottom-0 w-full transition-opacity duration-150 ${
        props.dimmed ? "text-n5 opacity-50" : "text-brand/70"
      }`}
      style={{ height: WAVE_HEIGHT }}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
});

function PlayheadMarker(props: { readonly store: PlayheadStore; readonly duration: number }) {
  const time = usePlayhead(props.store);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-20 -ml-px w-0.5 bg-n10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--neutral-1)_70%,transparent)]"
      style={{ left: percent(time, props.duration) }}
    >
      <div className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-brand shadow-sm" />
    </div>
  );
}

/**
 * Compact labels for a clip's own settings, e.g. `2×` and `Muted` or `40%`. Empty for a clip that
 * plays like the rest of the video.
 */
function overrideBadges(segment: VideoSegment): readonly string[] {
  const badges: string[] = [];
  if (segment.speed !== undefined) badges.push(`${segment.speed}×`);
  if (segment.muted === true) badges.push("Muted");
  else if (segment.volume !== undefined) badges.push(`${Math.round(segment.volume * 100)}%`);
  else if (segment.muted === false) badges.push("Sound on");
  return badges;
}

/**
 * Segment blocks; the one under the playhead gets an outline, cut ones a hatch and a label, and
 * kept clips with their own speed or sound a badge in the corner.
 */
const SegmentLayer = memo(function SegmentLayer(props: {
  readonly segments: readonly VideoSegment[];
  readonly duration: number;
  readonly store: PlayheadStore;
  /** The segment under the pointer, which shows its Cut or Restore button. */
  readonly hoveredId: string | null;
  readonly trackWidth: number;
  readonly onToggle: (id: string) => void;
}) {
  const { segments, duration, store, hoveredId, trackWidth } = props;
  const activeId = usePlayheadSelector(store, (time) => findSegmentAt(segments, time)?.id ?? null);
  // Cutting the only segment would cut everything; the toolbar still can, the hover can't.
  const toggleable = segments.length > 1;
  return (
    <>
      {segments.map((segment, index) => {
        const active = segment.id === activeId;
        const widthPx = ((segment.end - segment.start) / duration) * trackWidth;
        const showToggle = toggleable && segment.id === hoveredId && widthPx >= 64;
        const badges = segment.deleted || widthPx < 36 ? [] : overrideBadges(segment);
        return (
          <div
            key={segment.id}
            data-deleted={segment.deleted ? "" : undefined}
            data-active={active ? "" : undefined}
            className="pointer-events-none absolute inset-y-0 z-10"
            style={{
              left: percent(segment.start, duration),
              width: percent(segment.end - segment.start, duration),
            }}
          >
            {segment.deleted ? (
              <div className="absolute inset-0 flex items-center justify-center" style={CUT_HATCH}>
                {widthPx >= 40 ? (
                  <span className="rounded-xs bg-canvas/85 px-1.5 py-px text-[11px] leading-4 font-medium text-ink-muted">
                    Cut
                  </span>
                ) : null}
              </div>
            ) : null}
            <div
              className={`absolute inset-x-0 top-0 h-[3px] ${segment.deleted ? "bg-danger" : "bg-brand/70"}`}
            />
            {active ? (
              <div className="absolute inset-0 rounded-[3px] shadow-[inset_0_0_0_2px_var(--cte-accent)]" />
            ) : null}
            {index > 0 ? (
              <div className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-n10/80" />
            ) : null}
            {badges.length > 0 ? (
              <div
                className="absolute bottom-1 left-1.5 flex max-w-[calc(100%-12px)] gap-1 overflow-hidden"
                aria-hidden="true"
              >
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="timecode shrink-0 rounded-xs bg-canvas/90 px-1 text-[10px] leading-4 font-medium whitespace-nowrap text-ink shadow-sm"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
            {showToggle ? (
              <button
                type="button"
                className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2 rounded-xs bg-canvas/90 px-2 py-0.5 text-[11px] leading-4 font-medium text-ink shadow-sm backdrop-blur-sm transition-[scale,background-color] duration-150 hover:bg-canvas active:scale-[0.96]"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={() => props.onToggle(segment.id)}
              >
                {segment.deleted ? "Restore" : "Cut"}
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
});

/**
 * In and out grips on the kept span. Dragging one reports live frame-snapped times and commits on
 * release; arrow keys nudge it a frame (Shift: a second). The grips sit outside the span (the in
 * grip's right edge on the in point, the out grip's left edge on the out point), so their hit
 * targets never overlap, even at the shortest span.
 */
const TrimHandles = memo(function TrimHandles(props: {
  readonly segments: readonly VideoSegment[];
  readonly trim: TrimBounds;
  readonly duration: number;
  readonly frameRate: number;
  readonly trackRef: RefObject<HTMLDivElement | null>;
  readonly onTrim: (edge: TrimEdge, time: number, phase: ScrubPhase) => void;
}) {
  const { segments, trim, duration, frameRate, trackRef, onTrim } = props;
  const [dragging, setDragging] = useState<TrimEdge | null>(null);
  const drag = useRef<{ edge: TrimEdge; pointerId: number; offset: number } | null>(null);

  const limit = (edge: TrimEdge, time: number): number =>
    snapTrimEdge({ edge, time, trim, duration, fps: frameRate });

  const timeAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return 0;
    return ((clientX - rect.left) / rect.width) * duration;
  };

  const begin = (edge: TrimEdge) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    // Keep the grab point under the pointer instead of jumping the edge to it.
    const offset = (edge === "in" ? trim.in : trim.out) - timeAt(event.clientX);
    drag.current = { edge, pointerId: event.pointerId, offset };
    setDragging(edge);
    onTrim(edge, limit(edge, timeAt(event.clientX) + offset), "start");
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    onTrim(current.edge, limit(current.edge, timeAt(event.clientX) + current.offset), "move");
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
    onTrim(current.edge, limit(current.edge, timeAt(event.clientX) + current.offset), "end");
  };
  const nudge = (edge: TrimEdge) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const time = nudgeTrimEdge({
      edge,
      segments,
      trim,
      duration,
      fps: frameRate,
      direction: event.key === "ArrowLeft" ? -1 : 1,
      seconds: event.shiftKey,
    });
    onTrim(edge, time, "end");
  };

  const grip = (edge: TrimEdge) => {
    const time = edge === "in" ? trim.in : trim.out;
    const active = dragging === edge;
    return (
      <div
        key={edge}
        role="slider"
        tabIndex={0}
        aria-label={edge === "in" ? "Trim start" : "Trim end"}
        aria-valuemin={0}
        aria-valuemax={Number(duration.toFixed(3))}
        aria-valuenow={Number(time.toFixed(3))}
        aria-valuetext={formatTimecode(time, frameRate)}
        data-dragging={active ? "" : undefined}
        // A 24px hit target holding the 12px grip, wholly outside the kept span.
        className="group pointer-events-auto absolute -inset-y-1 z-30 flex w-6 cursor-ew-resize touch-none items-stretch outline-none"
        style={{
          left: percent(time, duration),
          transform: edge === "in" ? "translateX(-100%)" : undefined,
          justifyContent: edge === "in" ? "flex-end" : "flex-start",
        }}
        onPointerDown={begin(edge)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={nudge(edge)}
      >
        <div
          className={`flex w-3 items-center justify-center bg-brand shadow-sm transition-[scale] duration-150 group-hover:scale-x-110 group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-brand group-data-dragging:scale-x-110 ${
            edge === "in" ? "rounded-l-[5px] rounded-r-[2px]" : "rounded-l-[2px] rounded-r-[5px]"
          }`}
        >
          <div className="flex flex-col gap-[3px]">
            <span className="block h-px w-1.5 rounded-full bg-brand-ink/80" />
            <span className="block h-px w-1.5 rounded-full bg-brand-ink/80" />
            <span className="block h-px w-1.5 rounded-full bg-brand-ink/80" />
          </div>
        </div>
        {active ? (
          <span
            className="timecode pointer-events-none absolute -top-7 rounded-xs bg-n10 px-1.5 py-0.5 text-[11px] leading-4 whitespace-nowrap text-n1 shadow-md"
            style={
              edge === "in" ? { right: 0, translate: "50% 0" } : { left: 0, translate: "-50% 0" }
            }
          >
            {formatTimecode(time, frameRate)}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Top and bottom rails tie the grips together over the kept span. */}
      <div
        className="absolute -inset-y-1 rounded-[2px] shadow-[inset_0_2px_0_var(--cte-accent),inset_0_-2px_0_var(--cte-accent)]"
        style={{ left: percent(trim.in, duration), width: percent(trim.out - trim.in, duration) }}
      />
      {grip("in")}
      {grip("out")}
    </div>
  );
});

export function Timeline(props: TimelineProps) {
  const { duration, frameRate, segments, playhead, onScrub, onToggleSegment } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(trackRef);
  // The slider's value follows the playhead without re-rendering the timeline every frame.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track === null) return;
    const sync = () => {
      const time = playhead.get();
      track.setAttribute("aria-valuenow", String(Number(time.toFixed(3))));
      track.setAttribute("aria-valuetext", formatTimecode(time, frameRate));
    };
    sync();
    return playhead.subscribe(sync);
  }, [playhead, frameRate]);
  const scrubbing = useRef(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const timeAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return 0;
    return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    scrubbing.current = true;
    onScrub(timeAt(event.clientX), "start");
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) {
      if (event.pointerType === "mouse") {
        setHoveredId(findSegmentAt(segments, timeAt(event.clientX))?.id ?? null);
      }
      return;
    }
    onScrub(timeAt(event.clientX), "move");
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    onScrub(timeAt(event.clientX), "end");
  };

  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-3 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-3">
      {props.transport}
      <div
        className="relative"
        style={{ height: STRIP_HEIGHT + (props.audioTrack === null ? 0 : WAVE_HEIGHT) }}
      >
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Timeline"
          aria-valuemin={0}
          aria-valuemax={Number(duration.toFixed(3))}
          className="absolute inset-0 cursor-ew-resize rounded-sm bg-n2 touch-none overflow-hidden outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={() => setHoveredId(null)}
          onDoubleClick={(event) => {
            if (segments.length < 2) return;
            const target = findSegmentAt(segments, timeAt(event.clientX));
            if (target !== undefined) onToggleSegment(target.id);
          }}
        >
          <Filmstrip
            file={props.file}
            track={props.videoTrack}
            duration={duration}
            width={width}
            aspect={props.aspect}
          />
          {props.audioTrack === null ? null : (
            <Waveform
              track={props.audioTrack}
              duration={duration}
              dimmed={props.audioDimmed === true}
            />
          )}
          <SegmentLayer
            segments={segments}
            duration={duration}
            store={playhead}
            hoveredId={hoveredId}
            trackWidth={width}
            onToggle={onToggleSegment}
          />
          <PlayheadMarker store={playhead} duration={duration} />
        </div>
        {props.trim === null ? null : (
          <TrimHandles
            segments={segments}
            trim={props.trim}
            duration={duration}
            frameRate={frameRate}
            trackRef={trackRef}
            onTrim={props.onTrim}
          />
        )}
      </div>
      <div className="timecode flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span>{formatTimecode(0, frameRate)}</span>
        {props.caption === undefined ? null : (
          <span className="min-w-0 truncate font-ui" aria-live="polite">
            {props.caption}
          </span>
        )}
        <span>{formatTimecode(duration, frameRate)}</span>
      </div>
    </div>
  );
}
