import {
  canRedo,
  canUndo,
  clamp,
  commitVideoState,
  computeAudioGainAt,
  createHistory,
  createInitialVideoState,
  cropToPixels,
  allClipsMuted,
  effectiveSegmentMuted,
  effectiveSegmentSpeed,
  effectiveSegmentVolume,
  findSegmentAt,
  firstKeptTime,
  flipVideoX,
  formatDurationLabel,
  formatTimecode,
  frameIndexAt,
  FULL_RECT,
  getActiveCrop,
  getExportRanges,
  getKeptVideoDuration,
  getOutputDuration,
  getRangesOutputDuration,
  hasSegmentOverrides,
  isFullRect,
  keepVideoTool,
  KEYBIND_CATALOG,
  lastKeptTime,
  matchKeybind,
  nextKeptTime,
  nextShuttle,
  orientedFrameSize,
  parseVideoDocumentState,
  planVideoExport,
  previousKeptTime,
  redoHistory,
  restoreAllVideoSegments,
  rotateVideoCw,
  setVideoCropAspect,
  setVideoFade,
  setVideoInPoint,
  toggleTargetMuted,
  setSegmentSpeed,
  setSegmentVolume,
  setVideoOutPoint,
  SHUTTLE_PAUSED,
  snapToFrame,
  sourceToOutputTime,
  splitVideoAtTime,
  stepFrame,
  toggleDeleteVideoSegment,
  toggleVideoCrop,
  toggleVideoTool,
  trimPreviewTime,
  undoHistory,
  VIDEO_CROP_ASPECTS,
  VIDEO_FADE_PRESETS,
  VIDEO_SPEED_PRESETS,
  videoExportFileName,
  videoSegmentsEqual,
  type FrameSize,
  type KeybindAction,
  type NormalizedRect,
  type ShuttleKey,
  type ShuttleState,
  type VideoAdjustTarget,
  type VideoCropAspect,
  type VideoDocumentState,
  type VideoExportFormat,
  type VideoHistory,
  type VideoSegment,
  type VideoTool,
} from "@edit-here/core";
import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  Backward01Icon,
  Cancel01Icon,
  CropIcon,
  Delete02Icon,
  FastForwardIcon,
  FlipHorizontalIcon,
  GaugeIcon,
  Loading03Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  RotateClockwiseIcon,
  RotateLeft01Icon,
  ScissorIcon,
  SecondBracketIcon,
  Tick02Icon,
  Video01Icon,
  VolumeHighIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { Icon, type IconSvgElement } from "../../components/Icon";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  DockBar,
  DockDivider,
  TrayRow,
  EditorFrame,
  TrayGroup,
  PhoneScroller,
} from "../../components/EditorFrame";
import { Progress } from "../../components/graphical/index";
import { HintButton } from "../../components/HintButton";
import { numberedHint } from "../../lib/tool-keys";
import { detectPlatform, isEditableTarget, type Platform } from "../../lib/platform";
import { usePersist } from "../../lib/use-persist";
import { useObjectUrl } from "../../lib/use-object-url";
import { useIsNarrow } from "../../lib/use-is-narrow";
import type { EditorCommonProps, EditorToolbarActions } from "../types";
import { InlineSlider, Segmented } from "../image/controls";
import { CropOverlay } from "./CropOverlay";
import { downloadBlob, exportVideo } from "./export-video";
import {
  createPlayheadStore,
  usePlayhead,
  usePlayheadSelector,
  type PlayheadStore,
} from "./playhead";
import { writeFrameToClipboard } from "./copy-frame";
import { attachPreviewAudio, releasePreviewAudio, setPreviewGain } from "./preview-audio";
import { probeVideo, type ProbeResult, type VideoProbe } from "./probe";
import { createSeeker, type Seeker } from "./seeker";
import { Timeline, type ScrubPhase, type TrimBounds, type TrimEdge } from "./Timeline";
import { randomId } from "../../lib/new-id";

type ProbeState = { readonly kind: "loading" } | ProbeResult;

/** Loads the file with mediabunny, then mounts the workspace or explains why it can't. */
export function VideoEditor(props: EditorCommonProps) {
  const { file, onStatus, onRegisterActions, onMediaError } = props;
  const [probe, setProbe] = useState<ProbeState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let ready: VideoProbe | null = null;
    void probeVideo(file).then((result) => {
      if (cancelled) {
        if (result.kind === "ready") result.probe.input.dispose();
        return;
      }
      if (result.kind === "ready") ready = result.probe;
      else onStatus(result.message, "error");
      setProbe(result);
    });
    return () => {
      cancelled = true;
      ready?.input.dispose();
    };
  }, [file, onStatus]);

  useEffect(() => {
    if (probe.kind === "loading") onRegisterActions({ busy: true });
    else if (probe.kind === "unsupported") onRegisterActions({});
  }, [probe.kind, onRegisterActions]);

  useEffect(() => {
    if (probe.kind === "unsupported") onMediaError?.();
  }, [probe.kind, onMediaError]);

  switch (probe.kind) {
    case "loading":
      return (
        <div
          role="status"
          className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-ink-muted"
        >
          <Icon icon={Loading03Icon} className="size-4 animate-spin" />
          Reading video…
        </div>
      );
    case "unsupported":
      return (
        <div
          role="alert"
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
        >
          <Icon icon={Video01Icon} className="size-8 text-ink-muted" />
          <p className="max-w-sm text-sm text-ink">{probe.message}</p>
          <p className="max-w-sm text-xs text-ink-muted">
            Try an MP4 (H.264) or WebM (VP9) file, or open it in another browser.
          </p>
        </div>
      );
    case "ready":
      return <VideoWorkspace {...props} probe={probe.probe} />;
    default: {
      const _exhaustive: never = probe;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------------------------

const FORMAT_LABELS: Readonly<Record<VideoExportFormat, string>> = { mp4: "MP4", webm: "WebM" };
const VIDEO_FORMATS: readonly VideoExportFormat[] = ["mp4", "webm"];

const TRAY_LABELS: Readonly<Record<VideoTool, string>> = {
  none: "Options",
  trim: "Trim options",
  crop: "Crop and transform options",
  speed: "Speed options",
  audio: "Audio options",
};

const SPEED_OPTIONS = VIDEO_SPEED_PRESETS.map((speed) => ({
  value: String(speed),
  label: `${speed}×`,
}));
const FADE_OPTIONS = VIDEO_FADE_PRESETS.map((seconds) => ({
  value: String(seconds),
  label: seconds === 0 ? "Off" : `${seconds}s`,
}));
const ASPECT_OPTIONS = VIDEO_CROP_ASPECTS.map((aspect) => ({
  value: aspect,
  label: aspect === "free" ? "Free" : aspect,
}));

/** Which clips the speed and audio trays change: the one under the playhead, or every clip. */
type AdjustScope = "clip" | "all";
const isAdjustScope = (value: unknown): value is AdjustScope => value === "clip" || value === "all";
const ALL_CLIPS: VideoAdjustTarget = { kind: "all" };
/** The speed control's value while clips differ under "All": no preset is pressed. */
const MIXED = "mixed";

const isSpeedOption = (value: unknown): value is string =>
  SPEED_OPTIONS.some((option) => option.value === value);
const isFadeOption = (value: unknown): value is string =>
  FADE_OPTIONS.some((option) => option.value === value);
const isAspect = (value: unknown): value is VideoCropAspect =>
  VIDEO_CROP_ASPECTS.some((aspect) => aspect === value);

/** Compact segmented control for the options tray (no wrapping, sized to its labels). */
const SEGMENTED_CLASS = "flex flex-nowrap";
const SEGMENT_ITEM_CLASS = "px-2.5 max-sm:min-h-9";

function comboFor(action: KeybindAction): string {
  return KEYBIND_CATALOG[action].keys[0];
}

/** Fits a box of `aspect` (width / height) inside the element's content box. */
function useFittedSize(ref: RefObject<HTMLElement | null>, aspect: number): FrameSize {
  const [size, setSize] = useState<FrameSize>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      const fitWidth = Math.min(width, height * aspect);
      setSize({ width: Math.floor(fitWidth), height: Math.floor(fitWidth / aspect) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, aspect]);
  return size;
}

/** The kept span the trim handles sit on, or null when every segment is cut. */
function trimBoundsOf(segments: readonly VideoSegment[]): TrimBounds | null {
  const start = firstKeptTime(segments);
  const end = lastKeptTime(segments);
  return start === null || end === null ? null : { in: start, out: end };
}

type WorkspaceProps = EditorCommonProps & { readonly probe: VideoProbe };

type Commands = {
  readonly togglePlay: () => void;
  readonly shuttle: (key: ShuttleKey) => void;
  readonly step: (direction: 1 | -1) => void;
  readonly split: () => void;
  readonly cut: () => void;
  readonly toggleSegment: (id: string) => void;
  readonly inPoint: () => void;
  readonly outPoint: () => void;
  readonly resetTrim: () => void;
  readonly toggleTool: (tool: Exclude<VideoTool, "none">) => void;
  readonly closeTool: () => void;
  readonly toggleMute: () => void;
  readonly rotate: () => void;
  readonly flip: () => void;
  readonly setAspect: (aspect: VideoCropAspect) => void;
  readonly setFormat: (format: VideoExportFormat) => void;
  readonly setCrop: (rect: NormalizedRect) => void;
  readonly removeCrop: () => void;
  readonly setSpeed: (speed: number) => void;
  readonly setFade: (edge: "in" | "out", seconds: number) => void;
};

function VideoWorkspace({
  file,
  meta,
  onStatus,
  onRegisterActions,
  probe,
  initialState,
  onPersistState,
}: WorkspaceProps) {
  const url = useObjectUrl(file);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Effects that wire the element (audio graph, pitch) re-run when it mounts or changes.
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    // Pitch follows speed, as it does in the export (which resamples the audio).
    if (element !== null) element.preservesPitch = false;
    videoRef.current = element;
    setVideoElement(element);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const [platform] = useState<Platform>(detectPlatform);
  const [playhead] = useState(() => createPlayheadStore(0));
  const [history, setHistory] = useState<VideoHistory>(() =>
    createHistory(
      (initialState === undefined
        ? null
        : parseVideoDocumentState(initialState, probe.duration)) ?? {
        ...createInitialVideoState(probe.duration),
        exportFormat: probe.defaultExportFormat,
      },
    ),
  );
  usePersist(
    history.present,
    onPersistState === undefined ? undefined : (state) => onPersistState({ state }),
  );
  const [shuttle, setShuttle] = useState<ShuttleState>(SHUTTLE_PAUSED);
  const [draftCrop, setDraftCrop] = useState<NormalizedRect | null>(null);
  const [draftTrim, setDraftTrim] = useState<{ edge: TrimEdge; time: number } | null>(null);
  /** A volume drag in progress and the clips it changes; committed when the drag ends. */
  const [draftVolume, setDraftVolume] = useState<{
    readonly value: number;
    readonly target: VideoAdjustTarget;
  } | null>(null);
  /** The scope the user picked; null until they pick one (then "clip" while there are clips). */
  const [scopePick, setScopePick] = useState<AdjustScope | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const doc = history.present;
  const { duration, frameRate: fps } = probe;
  const frame = useMemo<FrameSize>(() => ({ width: probe.width, height: probe.height }), [probe]);
  // Crops live in the turned frame: what the viewer sees, before cropping.
  const oriented = orientedFrameSize(frame, doc.rotation);
  const quarterTurn = doc.rotation === 90 || doc.rotation === 270;
  const narrow = useIsNarrow();
  const cropShown = doc.tool === "crop" && doc.cropEnabled;
  // Outside the crop tool the stage previews the export: only the cropped region, at its aspect.
  const previewCrop = cropShown ? null : getActiveCrop(doc);
  const previewAspect =
    previewCrop === null
      ? oriented.width / oriented.height
      : (previewCrop.width * oriented.width) / (previewCrop.height * oriented.height);
  const box = useFittedSize(stageRef, previewAspect);
  const exporting = exportProgress !== null;
  const hasAudio = probe.sourceAudio !== null;

  const docRef = useRef(doc);
  useLayoutEffect(() => {
    docRef.current = doc;
  });

  // --- per-clip scope: the clip under the playhead ------------------------------------------
  const activeId = usePlayheadSelector(
    playhead,
    (time) => findSegmentAt(doc.segments, time)?.id ?? null,
  );
  const activeIndex = doc.segments.findIndex((s) => s.id === activeId);
  const activeSegment = doc.segments[activeIndex];
  const multiClip = doc.segments.length > 1;
  const scope: AdjustScope = multiClip ? (scopePick ?? "clip") : "all";
  const adjustTarget = useMemo<VideoAdjustTarget>(
    () => (scope === "clip" && activeId !== null ? { kind: "segment", id: activeId } : ALL_CLIPS),
    [scope, activeId],
  );
  const adjustTargetRef = useRef(adjustTarget);
  useLayoutEffect(() => {
    adjustTargetRef.current = adjustTarget;
  });

  // Every write to the element's time goes through the seeker, which holds the latest time the
  // user wants until it lands, whether playback runs or not (see `seeker.ts`).
  const seekerRef = useRef<Seeker | null>(null);
  useEffect(() => {
    if (videoElement === null) return;
    const seeker = createSeeker(videoElement, (time) => playhead.set(time));
    seekerRef.current = seeker;
    return () => {
      seeker.dispose();
      if (seekerRef.current === seeker) seekerRef.current = null;
    };
  }, [videoElement, playhead]);

  const commit = useCallback((update: (state: VideoDocumentState) => VideoDocumentState) => {
    setHistory((h) => commitVideoState(h, update(h.present)));
  }, []);

  /** Seeks to the middle of the frame at `time` so the browser shows exactly that frame. */
  const seek = useCallback(
    (time: number) => {
      const t = clamp(time, 0, duration);
      const centered = Math.min(duration, (frameIndexAt(t, fps) + 0.5) / fps);
      seekerRef.current?.seek(centered);
      playhead.set(centered);
    },
    [duration, fps, playhead],
  );

  /** Seeks to exactly `time`, for callers that already picked a time inside a kept frame. */
  const seekExact = useCallback(
    (time: number) => {
      const t = clamp(time, 0, duration);
      seekerRef.current?.seek(t);
      playhead.set(t);
    },
    [duration, playhead],
  );

  // --- live audio: each clip's volume and mute, and the fades, follow the playhead -----------
  // A volume drag previews on the clips it will change before it is committed.
  const audioDoc = useMemo(
    () =>
      draftVolume === null ? doc : setSegmentVolume(doc, draftVolume.target, draftVolume.value),
    [doc, draftVolume],
  );
  const applyGain = useRef<() => void>(() => {});
  useEffect(() => {
    const video = videoElement;
    if (video === null) return;
    const ranges = getExportRanges(audioDoc);
    const outputDuration = getRangesOutputDuration(ranges);
    const apply = () => {
      const time = playhead.get();
      const segment = findSegmentAt(audioDoc.segments, time);
      const output = sourceToOutputTime(ranges, time);
      setPreviewGain(
        video,
        computeAudioGainAt({
          outputTime: output ?? 0,
          outputDuration,
          volume:
            segment === undefined ? audioDoc.volume : effectiveSegmentVolume(segment, audioDoc),
          muted: segment === undefined ? audioDoc.muted : effectiveSegmentMuted(segment, audioDoc),
          fadeIn: audioDoc.fadeIn,
          fadeOut: audioDoc.fadeOut,
        }),
      );
    };
    applyGain.current = apply;
    apply();
    return playhead.subscribe(apply);
  }, [videoElement, playhead, audioDoc]);

  // Closing the video stops its audio graph; no AudioContext keeps running after the editor.
  useEffect(() => {
    if (videoElement === null) return;
    return () => releasePreviewAudio(videoElement);
  }, [videoElement]);

  /** Routes the element through Web Audio on the first play, inside the user's gesture. */
  const wakeAudio = useCallback(() => {
    const video = videoRef.current;
    if (video === null) return;
    attachPreviewAudio(video);
    applyGain.current();
  }, []);

  // --- playback: native forward play, manual reverse, deleted segments skipped ---------------
  useEffect(() => {
    const video = videoRef.current;
    const seeker = seekerRef.current;
    if (video === null || seeker === null) return;
    // Pausing only ends playback's hold on the time (the cleanup below): a target the user
    // queued behind the running seek, before or during playback, still lands.
    if (shuttle.kind === "paused") {
      video.pause();
      video.playbackRate = 1;
      return;
    }
    // Playback starts from the time the user last asked for, which the element may not show yet.
    const current = seeker.play();
    const segments = (): readonly VideoSegment[] => docRef.current.segments;
    /** The speed of the clip at `time`, so playback speeds up and slows down clip by clip. */
    const clipSpeed = (time: number): number => {
      const segment = findSegmentAt(segments(), time);
      return segment === undefined
        ? docRef.current.speed
        : effectiveSegmentSpeed(segment, docRef.current);
    };
    let raf = 0;
    const stop = (at: number) => {
      video.pause();
      if (seeker.end(at)) playhead.set(at);
      setShuttle(SHUTTLE_PAUSED);
    };

    if (shuttle.direction === "forward") {
      const from = current >= duration - 1 / fps ? 0 : current;
      const start = nextKeptTime(segments(), from) ?? firstKeptTime(segments());
      if (start === null) {
        // Nothing plays; a queued target still lands.
        seeker.stop();
        setShuttle(SHUTTLE_PAUSED);
        onStatus("Every segment is cut. Press X on one to restore it.", "info");
        return;
      }
      // Native playback runs from `start`, so it replaces a queued target now; a start within a
      // millisecond of the element's time leaves the element where it is.
      seeker.jump(Math.abs(start - video.currentTime) > 1e-3 ? start : video.currentTime);
      const rateAt = (time: number) => clamp(shuttle.speed * clipSpeed(time), 0.25, 16);
      video.playbackRate = rateAt(start);
      video.play().catch(() => setShuttle(SHUTTLE_PAUSED));
      const tick = () => {
        const t = video.currentTime;
        const next = nextKeptTime(segments(), t);
        if (next === null || video.ended) {
          stop(Math.min(t, lastKeptTime(segments()) ?? t));
          return;
        }
        if (next > t + 1e-3) seeker.jump(next);
        // Crossing into a clip with its own speed changes the rate on this frame.
        const rate = rateAt(next);
        if (video.playbackRate !== rate) video.playbackRate = rate;
        playhead.set(next);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(raf);
        seeker.stop();
      };
    }

    video.pause();
    let t = current;
    const head = firstKeptTime(segments());
    if (head !== null && t <= head + 1e-3) t = lastKeptTime(segments()) ?? t;
    let last = performance.now();
    const speed = shuttle.speed;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const previous = previousKeptTime(segments(), t - dt * speed * clipSpeed(t));
      if (previous === null) {
        stop(firstKeptTime(segments()) ?? 0);
        return;
      }
      t = previous;
      // Reverse "playback" is a stream of seeks; the seeker drops a frame while the last is
      // still decoding or the user's queued target has yet to land.
      seeker.frame(t);
      playhead.set(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      seeker.stop();
    };
  }, [shuttle, duration, fps, playhead, onStatus]);

  // --- commands -------------------------------------------------------------------------------
  const commands = useMemo<Commands>(() => {
    const cropFrame = (s: VideoDocumentState) => orientedFrameSize(frame, s.rotation);
    const setSegments = (next: readonly VideoSegment[]) =>
      commit((s) => (videoSegmentsEqual(s.segments, next) ? s : { ...s, segments: next }));
    return {
      togglePlay: () => {
        wakeAudio();
        setShuttle((s) =>
          s.kind === "paused"
            ? { kind: "playing", direction: "forward", speed: 1 }
            : SHUTTLE_PAUSED,
        );
      },
      shuttle: (key) => {
        if (key !== "k") wakeAudio();
        setShuttle((s) => nextShuttle(s, key));
      },
      step: (direction) => {
        setShuttle(SHUTTLE_PAUSED);
        seek(stepFrame({ time: playhead.get(), fps, direction, duration }));
      },
      split: () => {
        const time = snapToFrame(playhead.get(), fps);
        const { segments } = docRef.current;
        const next = splitVideoAtTime({ segments, time, newId: randomId() });
        if (next === segments) {
          onStatus("Move playhead inside a clip to split", "info");
          return;
        }
        setSegments(next);
      },
      cut: () => {
        const target = findSegmentAt(docRef.current.segments, playhead.get());
        if (target === undefined) return;
        setSegments(toggleDeleteVideoSegment(docRef.current.segments, target.id));
      },
      toggleSegment: (id) => setSegments(toggleDeleteVideoSegment(docRef.current.segments, id)),
      inPoint: () => {
        const time = snapToFrame(playhead.get(), fps);
        const { segments } = docRef.current;
        const next = setVideoInPoint({ segments, time, newId: randomId() });
        if (videoSegmentsEqual(next, segments)) {
          onStatus(
            duration - time < 0.1
              ? "Move the playhead earlier to set an in point"
              : "The in point is already here",
            "info",
          );
          return;
        }
        setSegments(next);
      },
      outPoint: () => {
        // The out point keeps the frame under the playhead.
        const time = Math.min(duration, snapToFrame(playhead.get(), fps) + 1 / fps);
        const { segments } = docRef.current;
        const next = setVideoOutPoint({ segments, time, newId: randomId() });
        if (videoSegmentsEqual(next, segments)) {
          onStatus(
            time < 0.1
              ? "Move the playhead later to set an out point"
              : "The out point is already here",
            "info",
          );
          return;
        }
        setSegments(next);
      },
      resetTrim: () => setSegments(restoreAllVideoSegments(docRef.current.segments)),
      toggleTool: (tool) => {
        if (tool !== "crop") {
          commit((s) => toggleVideoTool(s, tool));
          return;
        }
        commit((s) => {
          if (s.tool === "crop") return { ...s, tool: "none" };
          return s.cropEnabled
            ? { ...s, tool: "crop" }
            : toggleVideoCrop({ state: s, frame: cropFrame(s) });
        });
      },
      closeTool: () => commit((s) => (s.tool === "none" ? s : { ...s, tool: "none" })),
      toggleMute: () =>
        commit((s) => {
          // The tray's scope applies while the audio tray is open; M elsewhere mutes everything.
          // The press does what the button says: on "All", mixed clips read "Mute" and mute all.
          return toggleTargetMuted(s, s.tool === "audio" ? adjustTargetRef.current : ALL_CLIPS);
        }),
      rotate: () => commit(rotateVideoCw),
      flip: () => commit(flipVideoX),
      removeCrop: () => commit((s) => ({ ...s, crop: FULL_RECT, cropAspect: "free" })),
      setAspect: (next) =>
        commit((s) => setVideoCropAspect({ state: s, aspect: next, frame: cropFrame(s) })),
      setFormat: (format) =>
        commit((s) => (s.exportFormat === format ? s : { ...s, exportFormat: format })),
      setCrop: (rect) => commit((s) => ({ ...s, crop: rect })),
      setSpeed: (speed) => commit((s) => setSegmentSpeed(s, adjustTargetRef.current, speed)),
      setFade: (edge, seconds) => commit((s) => setVideoFade(s, edge, seconds)),
    };
  }, [commit, seek, playhead, fps, duration, frame, onStatus, wakeAudio]);

  const onScrub = useCallback(
    (time: number, phase: ScrubPhase) => {
      if (phase === "start") setShuttle(SHUTTLE_PAUSED);
      seek(time);
    },
    [seek],
  );

  const onTrim = useCallback(
    (edge: TrimEdge, raw: number, phase: ScrubPhase) => {
      if (phase === "start") setShuttle(SHUTTLE_PAUSED);
      // The timeline hands over frame-snapped times that keep the shortest span (`snapTrimEdge`).
      const time = clamp(raw, 0, duration);
      // Show the first kept frame for the in point and the last kept frame for the out point.
      if (phase !== "end") {
        // Just before the out point is the last frame it keeps, even when `time` is mid-frame.
        seek(edge === "in" ? time : Math.max(0, time - 1e-4));
        setDraftTrim({ edge, time });
        return;
      }
      setDraftTrim(null);
      const { segments } = docRef.current;
      const next = (edge === "in" ? setVideoInPoint : setVideoOutPoint)({
        segments,
        time,
        newId: randomId(),
      });
      // A trim that ends inside a cut lands past it, so show the kept frame at the edge it landed
      // on. `seek` would re-center onto a frame that can sit in a neighbouring cut.
      seekExact(trimPreviewTime({ edge, segments: next, fps, duration }));
      commit((s) => (videoSegmentsEqual(s.segments, next) ? s : { ...s, segments: next }));
    },
    [commit, seek, seekExact, fps, duration],
  );

  const onCropChange = useCallback(
    (rect: NormalizedRect, done: boolean) => {
      if (done) {
        setDraftCrop(null);
        commands.setCrop(rect);
      } else {
        setDraftCrop(rect);
      }
    },
    [commands],
  );

  // --- copy and export --------------------------------------------------------------------------
  /** Resolves once the frame is on the clipboard; rejects (after its toast) when it isn't. */
  const copyFrame = useCallback((): Promise<void> | undefined => {
    const video = videoRef.current;
    if (video === null || video.videoWidth === 0) {
      onStatus("The video isn't ready to copy yet.", "error");
      return;
    }
    if (typeof ClipboardItem === "undefined" || navigator.clipboard === undefined) {
      onStatus("This browser can't copy images to the clipboard.", "error");
      return;
    }
    const state = docRef.current;
    const source = { width: video.videoWidth, height: video.videoHeight };
    const turned = orientedFrameSize(source, state.rotation);
    // Turn, then mirror, then crop: the same order as the export.
    const full = document.createElement("canvas");
    full.width = turned.width;
    full.height = turned.height;
    const fullCtx = full.getContext("2d");
    if (fullCtx === null) {
      onStatus("This browser can't copy images to the clipboard.", "error");
      return;
    }
    fullCtx.translate(turned.width / 2, turned.height / 2);
    if (state.flipX) fullCtx.scale(-1, 1);
    fullCtx.rotate((state.rotation * Math.PI) / 180);
    fullCtx.drawImage(video, -source.width / 2, -source.height / 2, source.width, source.height);
    const crop = getActiveCrop(state);
    const px =
      crop === null ? { left: 0, top: 0, ...turned } : cropToPixels({ rect: crop, frame: turned });
    const canvas = document.createElement("canvas");
    canvas.width = px.width;
    canvas.height = px.height;
    canvas
      .getContext("2d")
      ?.drawImage(full, px.left, px.top, px.width, px.height, 0, 0, px.width, px.height);
    // Pass the PNG as a promise so Safari keeps the user gesture while it encodes.
    const png = new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob === null ? reject(new Error("PNG encoding failed.")) : resolve(blob)),
        "image/png",
      );
    });
    return writeFrameToClipboard({
      png,
      clipboard: navigator.clipboard,
      toItem: (data) => new ClipboardItem({ "image/png": data }),
      onStatus,
    });
  }, [onStatus]);

  const exportFile = useCallback(async () => {
    const plan = planVideoExport({ state: docRef.current, frame });
    if (plan.kind === "empty") throw new Error("Every segment is cut. Restore one to export.");
    setShuttle(SHUTTLE_PAUSED);
    setExportProgress(0);
    try {
      const result = await exportVideo({
        file,
        plan,
        sourceCodec: probe.videoCodec,
        sourceAudio: probe.sourceAudio,
        width: probe.width,
        height: probe.height,
        frameRate: probe.frameRate,
        onProgress: setExportProgress,
      });
      downloadBlob(result.blob, videoExportFileName(meta.name, plan.format));
      // After the shell's success toast, so the warning is the one left on screen.
      for (const warning of result.warnings) window.setTimeout(() => onStatus(warning, "info"), 0);
    } finally {
      setExportProgress(null);
    }
  }, [file, frame, meta.name, onStatus, probe]);

  // Header actions: stable wrappers so registering doesn't loop through the shell.
  const latest = useRef({ copyFrame, exportFile });
  useLayoutEffect(() => {
    latest.current = { copyFrame, exportFile };
  });
  const stableActions = useMemo(
    () => ({
      copy: () => latest.current.copyFrame(),
      exportFile: () => latest.current.exportFile(),
      undo: () => setHistory((h) => keepVideoTool(h, undoHistory(h))),
      redo: () => setHistory((h) => keepVideoTool(h, redoHistory(h))),
    }),
    [],
  );
  const undoable = canUndo(history);
  const redoable = canRedo(history);
  const setFormat = commands.setFormat;
  const exportFormats = useMemo(
    () => ({
      options: VIDEO_FORMATS.map((format) => ({ id: format, label: FORMAT_LABELS[format] })),
      selected: doc.exportFormat,
      onSelect: (id: string) => {
        const format = VIDEO_FORMATS.find((f) => f === id);
        if (format !== undefined) setFormat(format);
      },
    }),
    [doc.exportFormat, setFormat],
  );
  useEffect(() => {
    const actions: EditorToolbarActions = {
      ...stableActions,
      canUndo: undoable,
      canRedo: redoable,
      exportLabel: `Export ${FORMAT_LABELS[doc.exportFormat]}`,
      exportFormats,
      copyLabel: "Copy frame",
      busy: exporting,
    };
    onRegisterActions(actions);
  }, [
    onRegisterActions,
    stableActions,
    undoable,
    redoable,
    doc.exportFormat,
    exportFormats,
    exporting,
  ]);

  // --- keyboard ---------------------------------------------------------------------------------
  const keyState = useRef({ commands, exporting });
  useLayoutEffect(() => {
    keyState.current = { commands, exporting };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target)) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]') !== null)
        return;
      const action = matchKeybind(event, "video");
      if (action === "global.escape" && docRef.current.tool !== "none") {
        event.preventDefault();
        keyState.current.commands.closeTool();
        return;
      }
      if (action === null || !action.startsWith("video.")) return;
      const { commands: c, exporting: busy } = keyState.current;
      event.preventDefault();
      const repeatable = action === "video.stepBack" || action === "video.stepForward";
      if (busy || (event.repeat && !repeatable)) return;
      switch (action) {
        case "video.playPause":
          return c.togglePlay();
        case "video.split":
          return c.split();
        case "video.cutSegment":
          return c.cut();
        case "video.trimTool":
          return c.toggleTool("trim");
        case "video.inPoint":
          return c.inPoint();
        case "video.outPoint":
          return c.outPoint();
        case "video.cropToggle":
          return c.toggleTool("crop");
        case "video.speedTool":
          return c.toggleTool("speed");
        case "video.audioTool":
          return c.toggleTool("audio");
        case "video.mute":
          return c.toggleMute();
        case "video.rotate":
          return c.rotate();
        case "video.flip":
          return c.flip();
        case "video.shuttleBack":
          return c.shuttle("j");
        case "video.shuttlePause":
          return c.shuttle("k");
        case "video.shuttleForward":
          return c.shuttle("l");
        case "video.stepBack":
          return c.step(-1);
        case "video.stepForward":
          return c.step(1);
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // --- render -----------------------------------------------------------------------------------
  const cropRect = draftCrop ?? doc.crop;
  const cropPixels = cropToPixels({ rect: cropRect, frame: oriented });

  const progressPercent = exportProgress === null ? 0 : Math.round(exportProgress * 100);
  const shownSegments = useMemo(() => {
    if (draftTrim === null) return doc.segments;
    const edit = draftTrim.edge === "in" ? setVideoInPoint : setVideoOutPoint;
    return edit({ segments: doc.segments, time: draftTrim.time, newId: "draft-trim" });
  }, [doc.segments, draftTrim]);
  const trimBounds = trimBoundsOf(shownSegments);
  // Readouts follow a handle while it is dragged.
  const keptDuration = getKeptVideoDuration(shownSegments);
  const outputDuration = getOutputDuration({ segments: shownSegments, speed: doc.speed });
  // What the speed and audio trays show: the clip under the playhead, or the whole video.
  const scopedSegment = scope === "clip" ? activeSegment : undefined;
  const shownSpeed =
    scopedSegment === undefined ? doc.speed : effectiveSegmentSpeed(scopedSegment, doc);
  const shownMuted =
    scopedSegment === undefined ? allClipsMuted(doc) : effectiveSegmentMuted(scopedSegment, doc);
  const shownVolume =
    draftVolume?.value ??
    (scopedSegment === undefined ? doc.volume : effectiveSegmentVolume(scopedSegment, doc));
  const clipsDiffer = (key: "speed" | "volume" | "muted") =>
    scope === "all" && doc.segments.some((s) => s[key] !== undefined);
  const adjustedClips = doc.segments.filter((s) => !s.deleted && hasSegmentOverrides(s)).length;
  const clipLabel = `Clip ${activeIndex + 1}`;

  // The dock and transport skip re-rendering on drags (trim, volume) that don't change them.
  const allMuted = allClipsMuted(doc);
  const segments = doc.segments;
  const tool = doc.tool;
  const bar = useMemo(() => {
    const toolButton = (args: {
      tool: Exclude<VideoTool, "none">;
      action: KeybindAction;
      label: string;
      mobileLabel: string;
      icon: IconSvgElement;
    }) => {
      const open = tool === args.tool;
      return (
        <HintButton
          label={open ? `Close ${args.label.toLowerCase()}` : args.label}
          mobileLabel={args.mobileLabel}
          icon={<Icon icon={args.icon} className="size-4" />}
          {...numberedHint(args.action)}
          platform={platform}
          pressed={open}
          variant={open ? "secondary" : "ghost"}
          disabled={exporting}
          onClick={() => commands.toggleTool(args.tool)}
        />
      );
    };
    return (
      <DockBar label="Video tools">
        <HintButton
          label="Split at playhead"
          mobileLabel="Split"
          icon={<Icon icon={ScissorIcon} className="size-4" />}
          {...numberedHint("video.split")}
          platform={platform}
          disabled={exporting}
          onClick={commands.split}
        />
        <CutButton
          store={playhead}
          segments={segments}
          platform={platform}
          disabled={exporting}
          onClick={commands.cut}
        />
        <DockDivider />
        {toolButton({
          tool: "trim",
          action: "video.trimTool",
          label: "Trim",
          mobileLabel: "Trim",
          icon: SecondBracketIcon,
        })}
        {toolButton({
          tool: "crop",
          action: "video.cropToggle",
          label: "Crop and transform",
          mobileLabel: "Crop",
          icon: CropIcon,
        })}
        {toolButton({
          tool: "speed",
          action: "video.speedTool",
          label: "Speed",
          mobileLabel: "Speed",
          icon: GaugeIcon,
        })}
        {toolButton({
          tool: "audio",
          action: "video.audioTool",
          label: "Audio",
          mobileLabel: allMuted ? "Muted" : "Audio",
          icon: allMuted ? VolumeOffIcon : VolumeHighIcon,
        })}
      </DockBar>
    );
  }, [platform, exporting, commands, playhead, segments, tool, allMuted]);

  const doneButton = (
    <HintButton
      label="Done"
      showLabel
      variant={narrow ? "primary" : "ghost"}
      icon={<Icon icon={Tick02Icon} className="size-4" />}
      combo="Escape"
      platform={platform}
      onClick={commands.closeTool}
    />
  );

  const trimTray = (
    <TrayRow>
      <div className="flex shrink-0 items-center gap-1">
        <HintButton
          label="Set in"
          showLabel
          labelClassName="max-sm:hidden"
          icon={<Icon icon={ArrowRightToLineIcon} className="size-4" />}
          combo={comboFor("video.inPoint")}
          platform={platform}
          disabled={exporting}
          onClick={commands.inPoint}
        />
        <HintButton
          label="Set out"
          showLabel
          labelClassName="max-sm:hidden"
          icon={<Icon icon={ArrowLeftToLineIcon} className="size-4" />}
          combo={comboFor("video.outPoint")}
          platform={platform}
          disabled={exporting}
          onClick={commands.outPoint}
        />
      </div>
      <DockDivider className="max-sm:hidden" />
      <span
        className="timecode min-w-0 truncate text-xs whitespace-nowrap text-ink-muted max-sm:flex-1"
        aria-label="Kept range"
      >
        {trimBounds === null ? (
          "Everything is cut"
        ) : (
          <>
            <span className="text-ink">{formatTimecode(trimBounds.in, fps)}</span>
            {" → "}
            <span className="text-ink">{formatTimecode(trimBounds.out, fps)}</span>
            <span className="max-sm:hidden">{` · ${formatDurationLabel(keptDuration)} kept`}</span>
          </>
        )}
      </span>
      <DockDivider className="max-sm:hidden" />
      <div className="flex shrink-0 items-center gap-1">
        <HintButton
          label="Reset trim"
          showLabel
          labelClassName="max-sm:hidden"
          icon={<Icon icon={RotateLeft01Icon} className="size-4" />}
          platform={platform}
          disabled={exporting || !doc.segments.some((s) => s.deleted)}
          onClick={commands.resetTrim}
        />
        {narrow ? doneButton : null}
      </div>
    </TrayRow>
  );

  const cropTray = (
    <TrayRow>
      <TrayGroup label="Aspect" className="max-sm:flex-1">
        <PhoneScroller>
          <Segmented
            label="Crop aspect ratio"
            value={doc.cropAspect}
            options={ASPECT_OPTIONS}
            isValue={isAspect}
            onChange={commands.setAspect}
            className={SEGMENTED_CLASS}
            itemClassName={SEGMENT_ITEM_CLASS}
          />
        </PhoneScroller>
      </TrayGroup>
      <DockDivider className="max-sm:hidden" />
      <div className="flex shrink-0 items-center gap-1">
        <HintButton
          label="Rotate 90°"
          icon={<Icon icon={RotateClockwiseIcon} className="size-4" />}
          combo={comboFor("video.rotate")}
          platform={platform}
          disabled={exporting}
          onClick={commands.rotate}
        />
        <HintButton
          label="Flip horizontally"
          icon={<Icon icon={FlipHorizontalIcon} className="size-4" />}
          combo={comboFor("video.flip")}
          platform={platform}
          pressed={doc.flipX}
          variant={doc.flipX ? "secondary" : "ghost"}
          disabled={exporting}
          onClick={commands.flip}
        />
      </div>
      <span
        className="timecode shrink-0 text-xs whitespace-nowrap text-ink-muted max-sm:hidden"
        aria-label="Crop size"
      >
        {cropPixels.width} × {cropPixels.height} px
      </span>
      <DockDivider className="max-sm:hidden" />
      <div className="flex shrink-0 items-center gap-1">
        <HintButton
          label="Remove crop"
          showLabel
          labelClassName="max-sm:hidden"
          icon={<Icon icon={Cancel01Icon} className="size-4" />}
          platform={platform}
          disabled={exporting || (isFullRect(doc.crop) && doc.cropAspect === "free")}
          onClick={commands.removeCrop}
        />
        {doneButton}
      </div>
    </TrayRow>
  );

  const scopeSwitch = multiClip ? (
    <>
      <Segmented
        label="Apply to"
        value={scope}
        options={[
          { value: "clip", label: clipLabel, title: `${clipLabel}, under the playhead` },
          { value: "all", label: "All", title: "Every clip" },
        ]}
        isValue={isAdjustScope}
        onChange={setScopePick}
        className={`${SEGMENTED_CLASS} shrink-0`}
        itemClassName={`${SEGMENT_ITEM_CLASS} min-w-14`}
      />
      <DockDivider className="max-sm:hidden" />
    </>
  ) : null;

  const speedTray = (
    <TrayRow>
      {scopeSwitch}
      <TrayGroup label="Speed" className="max-sm:flex-1">
        <PhoneScroller>
          <Segmented
            label={scope === "clip" ? `${clipLabel} speed` : "Playback speed"}
            value={clipsDiffer("speed") ? MIXED : String(shownSpeed)}
            options={SPEED_OPTIONS}
            isValue={isSpeedOption}
            onChange={(value) => commands.setSpeed(Number(value))}
            className={SEGMENTED_CLASS}
            itemClassName={SEGMENT_ITEM_CLASS}
          />
        </PhoneScroller>
      </TrayGroup>
      <DockDivider className="max-sm:hidden" />
      <span
        className={`timecode shrink-0 text-xs whitespace-nowrap text-ink-muted ${multiClip ? "max-sm:hidden" : ""}`}
        aria-label="Output duration"
        aria-live="polite"
      >
        <span className="text-ink">{formatDurationLabel(outputDuration)}</span> output
      </span>
      {narrow ? doneButton : null}
    </TrayRow>
  );

  const fadeControl = (edge: "in" | "out") => (
    // Labelled on phones too: the two fade groups look alike without their names. With several
    // clips the label says the fade is on the whole video, not the clip the scope points at.
    <div className="flex shrink-0 items-center gap-2">
      <span className="shrink-0 text-xs text-ink-muted">
        {multiClip ? "Video " : ""}
        {edge === "in" ? (multiClip ? "fade in" : "Fade in") : multiClip ? "fade out" : "Fade out"}
      </span>
      <Segmented
        label={`${edge === "in" ? "Fade in" : "Fade out"}${multiClip ? " for the whole video" : ""}`}
        value={String(edge === "in" ? doc.fadeIn : doc.fadeOut)}
        options={FADE_OPTIONS}
        isValue={isFadeOption}
        onChange={(value) => commands.setFade(edge, Number(value))}
        className={SEGMENTED_CLASS}
        itemClassName={SEGMENT_ITEM_CLASS}
      />
    </div>
  );

  const mutePressed = shownMuted;
  const audioTray = hasAudio ? (
    <TrayRow>
      {scopeSwitch}
      <PhoneScroller>
        <div className="flex items-center gap-3 max-sm:gap-2">
          <HintButton
            label={mutePressed ? "Unmute" : "Mute"}
            showLabel
            labelClassName="max-sm:hidden"
            icon={<Icon icon={mutePressed ? VolumeOffIcon : VolumeHighIcon} className="size-4" />}
            combo={comboFor("video.mute")}
            platform={platform}
            pressed={mutePressed}
            variant={mutePressed ? "secondary" : "ghost"}
            disabled={exporting}
            onClick={commands.toggleMute}
          />
          <InlineSlider
            label={scope === "clip" ? `${clipLabel} volume` : "Volume"}
            value={Math.round(shownVolume * 100)}
            min={0}
            max={200}
            unit="%"
            className="w-52 shrink-0 max-sm:w-36"
            labelClassName="min-w-0! text-xs! font-normal! text-ink-muted! max-sm:sr-only"
            onChange={(percent) =>
              setDraftVolume((draft) => ({
                value: percent / 100,
                // Keep the clip the drag started on even if the playhead moves meanwhile.
                target: draft?.target ?? adjustTargetRef.current,
              }))
            }
            onCommit={(percent) => {
              const target = draftVolume?.target ?? adjustTargetRef.current;
              setDraftVolume(null);
              commit((s) => setSegmentVolume(s, target, percent / 100));
            }}
          />
          <DockDivider className="max-sm:hidden" />
          {fadeControl("in")}
          {fadeControl("out")}
        </div>
      </PhoneScroller>
      {narrow ? doneButton : null}
    </TrayRow>
  ) : (
    <TrayRow>
      <span className="flex items-center gap-2 px-1 text-xs whitespace-nowrap text-ink-muted max-sm:flex-1">
        <Icon icon={VolumeOffIcon} className="size-4" />
        This video has no audio track
      </span>
      {narrow ? doneButton : null}
    </TrayRow>
  );

  const tray = (() => {
    switch (doc.tool) {
      case "none":
        return null;
      case "trim":
        return trimTray;
      case "crop":
        return cropTray;
      case "speed":
        return speedTray;
      case "audio":
        return audioTray;
      default: {
        const _exhaustive: never = doc.tool;
        return _exhaustive;
      }
    }
  })();

  const paused = shuttle.kind === "paused";
  const transport = useMemo(
    () => (
      <div className="flex items-center gap-0.5" role="toolbar" aria-label="Playback">
        <HintButton
          label={paused ? "Play" : "Pause"}
          icon={
            paused ? (
              <Icon icon={PlayIcon} className="size-4" />
            ) : (
              <Icon icon={PauseIcon} className="size-4" />
            )
          }
          combo={comboFor("video.playPause")}
          platform={platform}
          variant="secondary"
          disabled={exporting}
          onClick={commands.togglePlay}
        />
        <HintButton
          label="Previous frame"
          icon={<Icon icon={PreviousIcon} className="size-4" />}
          combo={comboFor("video.stepBack")}
          platform={platform}
          disabled={exporting}
          onClick={() => commands.step(-1)}
        />
        <HintButton
          label="Next frame"
          icon={<Icon icon={NextIcon} className="size-4" />}
          combo={comboFor("video.stepForward")}
          platform={platform}
          disabled={exporting}
          onClick={() => commands.step(1)}
        />
        <TimecodeReadout store={playhead} fps={fps} duration={duration} />
      </div>
    ),
    [paused, platform, exporting, commands, playhead, fps, duration],
  );

  const clipSpeeds = doc.segments.some((s) => !s.deleted && s.speed !== undefined);
  const summary = [
    `Keeping ${formatDurationLabel(keptDuration)} of ${formatDurationLabel(duration)}`,
    doc.speed === 1 && !clipSpeeds
      ? null
      : clipSpeeds
        ? `${formatDurationLabel(outputDuration)} output`
        : `${doc.speed}× → ${formatDurationLabel(outputDuration)}`,
    adjustedClips === 0 ? null : `${adjustedClips} clip${adjustedClips === 1 ? "" : "s"} adjusted`,
    doc.muted ? "muted" : doc.volume === 1 ? null : `volume ${Math.round(doc.volume * 100)}%`,
    !doc.muted && (doc.fadeIn > 0 || doc.fadeOut > 0) ? "fades" : null,
    getActiveCrop(doc) === null ? null : `cropped to ${cropPixels.width}×${cropPixels.height}`,
    doc.rotation === 0 ? null : `turned ${doc.rotation}°`,
    doc.flipX ? "flipped" : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  // The full turned frame inside the stage box; offset and scaled to show only the crop.
  const layerStyle: CSSProperties =
    previewCrop === null
      ? { left: 0, top: 0, width: "100%", height: "100%" }
      : {
          width: `${100 / previewCrop.width}%`,
          height: `${100 / previewCrop.height}%`,
          left: `${-(previewCrop.x / previewCrop.width) * 100}%`,
          top: `${-(previewCrop.y / previewCrop.height) * 100}%`,
        };
  // The element is laid out unturned, then turned and mirrored into the layer (turn first,
  // then mirror, as the export does).
  const videoStyle: CSSProperties = {
    width: quarterTurn ? `${(oriented.height / oriented.width) * 100}%` : "100%",
    height: quarterTurn ? `${(oriented.width / oriented.height) * 100}%` : "100%",
    transform: `translate(-50%, -50%)${doc.flipX ? " scaleX(-1)" : ""} rotate(${doc.rotation}deg)`,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorFrame bar={bar} tray={tray} trayLabel={TRAY_LABELS[doc.tool]}>
        <div
          ref={stageRef}
          className="relative flex min-h-[200px] flex-1 items-center justify-center overflow-hidden px-2 pt-[var(--dock-top)] pb-[max(12px,var(--dock-bottom))] sm:px-6"
        >
          <div
            className="relative overflow-hidden rounded-xs"
            style={{ width: box.width, height: box.height }}
          >
            <div className="absolute" style={layerStyle}>
              {url === null ? null : (
                <video
                  ref={attachVideo}
                  src={url}
                  aria-label={meta.name}
                  playsInline
                  preload="auto"
                  className="absolute top-1/2 left-1/2 block max-w-none"
                  style={videoStyle}
                  onEnded={() => setShuttle(SHUTTLE_PAUSED)}
                  onError={() => {
                    const message = "This browser can't play this video for preview.";
                    setPlaybackError(message);
                    onStatus(message, "error");
                  }}
                />
              )}
            </div>
            {cropShown ? (
              <CropOverlay
                rect={cropRect}
                aspect={doc.cropAspect}
                frame={oriented}
                onChange={onCropChange}
              />
            ) : null}
          </div>

          {shuttle.kind === "playing" && (shuttle.speed > 1 || shuttle.direction === "backward") ? (
            <div className="timecode absolute top-3 left-4 flex items-center gap-1.5 rounded-sm bg-canvas/80 px-2 py-1 text-xs text-ink shadow-sm backdrop-blur-sm">
              {shuttle.direction === "forward" ? (
                <Icon icon={FastForwardIcon} className="size-3.5" />
              ) : (
                <Icon icon={Backward01Icon} className="size-3.5" />
              )}
              {shuttle.speed}×
            </div>
          ) : null}

          {playbackError === null ? null : (
            <div
              role="alert"
              className="absolute inset-x-4 top-3 rounded-sm bg-canvas/90 p-3 text-sm text-ink shadow-sm"
            >
              {playbackError}
            </div>
          )}

          {exporting ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
              <div
                className="alloy-panel flex w-64 flex-col gap-2 p-4"
                role="status"
                aria-live="polite"
              >
                <Progress.Root value={progressPercent} aria-label="Export progress">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">Exporting {FORMAT_LABELS[doc.exportFormat]}</span>
                    <span className="timecode text-ink-muted">{progressPercent}%</span>
                  </div>
                  <Progress.Track className="mt-2">
                    <Progress.Indicator />
                  </Progress.Track>
                </Progress.Root>
              </div>
            </div>
          ) : null}
        </div>
      </EditorFrame>

      <Timeline
        transport={transport}
        duration={duration}
        frameRate={fps}
        segments={shownSegments}
        playhead={playhead}
        file={file}
        videoTrack={probe.videoTrack}
        audioTrack={probe.audioTrack}
        audioDimmed={doc.muted || doc.volume === 0}
        aspect={probe.width / probe.height}
        caption={summary}
        trim={exporting ? null : trimBounds}
        onScrub={onScrub}
        onTrim={onTrim}
        onToggleSegment={commands.toggleSegment}
      />
    </div>
  );
}

function TimecodeReadout(props: {
  readonly store: PlayheadStore;
  readonly fps: number;
  readonly duration: number;
}) {
  const time = usePlayhead(props.store);
  return (
    <span
      className="timecode px-2 text-xs whitespace-nowrap text-ink tabular-nums"
      aria-label="Playhead position"
    >
      {formatTimecode(time, props.fps)}
      <span className="text-ink-muted"> / {formatTimecode(props.duration, props.fps)}</span>
    </span>
  );
}

/** Cut or restore the segment under the playhead; the label follows that segment's state. */
function CutButton(props: {
  readonly store: PlayheadStore;
  readonly segments: readonly VideoSegment[];
  readonly platform: Platform;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const deleted = usePlayheadSelector(
    props.store,
    (time) => findSegmentAt(props.segments, time)?.deleted === true,
  );
  return (
    <HintButton
      label={deleted ? "Restore segment" : "Cut segment"}
      mobileLabel={deleted ? "Restore" : "Cut"}
      icon={
        deleted ? (
          <Icon icon={RotateLeft01Icon} className="size-4" />
        ) : (
          <Icon icon={Delete02Icon} className="size-4" />
        )
      }
      {...numberedHint("video.cutSegment")}
      platform={props.platform}
      disabled={props.disabled}
      onClick={props.onClick}
    />
  );
}
