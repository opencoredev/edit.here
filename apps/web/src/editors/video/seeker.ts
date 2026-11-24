/**
 * Owns `currentTime` on a `<video>` element: every write goes through the seeker, which keeps
 * the latest time the user wants and decides when it reaches the element.
 *
 * Setting `currentTime` while a seek is still decoding aborts it, so a drag that seeks on every
 * pointer move never shows a frame until it stops. The seeker keeps only the latest target while
 * a seek runs and applies it when that seek lands, so the preview keeps updating during a scrub
 * and always ends on the last requested time.
 *
 * Two parties write the time. The user (scrub, trim, frame step) asks for a time with `seek`;
 * that time always lands, and so does the time playback ends on (`end`). Playback (`play` to `stop`) drives the
 * time while it runs; its frames are a stream, so one that cannot be shown now is dropped and
 * the next frame supersedes it. A user target queued when playback starts still lands, and
 * playback continues from it, so pausing before the running seek lands (J then K) cannot lose it.
 *
 * | state \ event      | idle                       | queued(t)              | playing                      | playing+queued(t)        |
 * | ------------------ | -------------------------- | ---------------------- | ---------------------------- | ------------------------ |
 * | `seek(u)`          | seeking ? queued(u)        | queued(u)              | seeking ? queued(u)          | queued(u)                |
 * |                    | : write u, idle            |                        | : write u, idle              |                          |
 * | `play()` returns   | current time; playing      | t; playing+queued(t)   | current time; playing        | t; playing+queued(t)     |
 * | `jump(p)`          | ignored                    | ignored                | write p; playing             | write p; playing         |
 * | `frame(p)`         | ignored                    | ignored                | seeking ? drop : write p     | drop (t lands first)     |
 * | `end(p)`           | ignored, false             | ignored, false         | as `seek(p)`, true           | as `seek(p)`, true       |
 * | `stop()`           | idle                       | queued(t)              | idle                         | queued(t)                |
 * | `seeked`           | onSettled(current time)    | write t; idle          | nothing                      | write t; playing         |
 * | `emptied` (source) | idle                       | idle                   | playing                      | playing                  |
 *
 * "write" sets `currentTime` (skipped when it already reads that time; a landing target that
 * matches calls `onSettled` instead). `queued` only exists while a seek runs, so a `seeked`
 * always follows it. A user `seek` takes the time back from playback at once, so a playback frame
 * or end that runs before the playback loop is cancelled cannot overwrite it. A new source drops the
 * target (its old times mean nothing on it), and `dispose` stops listening.
 */
export type Seeker = {
  /** The user wants `time`: shown now when idle, or as soon as the running seek lands. */
  readonly seek: (time: number) => void;
  /**
   * Playback takes over `currentTime`. Returns the time it starts from: the user's queued target
   * when there is one (it still lands, then playback frames show), else the element's time.
   */
  readonly play: () => number;
  /** Playback moves to `time` now (play start, skipping a cut), replacing any queued target. */
  readonly jump: (time: number) => void;
  /** Playback shows `time` if the element is free; a frame it cannot show yet is dropped. */
  readonly frame: (time: number) => void;
  /**
   * Playback reached the end of what it plays and stops on `time`, which lands like a `seek`.
   * Returns false, changing nothing, when the user has already taken the time back.
   */
  readonly end: (time: number) => boolean;
  /** Playback stops (paused, or its loop is torn down). A queued user target still lands. */
  readonly stop: () => void;
  readonly dispose: () => void;
};

type SeekEvent = "seeked" | "emptied";

/** The part of a media element the seeker uses (an `HTMLVideoElement` in the editor). */
export type SeekTarget = {
  currentTime: number;
  readonly seeking: boolean;
  addEventListener(type: SeekEvent, listener: () => void): void;
  removeEventListener(type: SeekEvent, listener: () => void): void;
};

type SeekState =
  | { readonly kind: "idle" }
  | { readonly kind: "queued"; readonly time: number }
  | { readonly kind: "playing" }
  | { readonly kind: "playing+queued"; readonly time: number };

const IDLE: SeekState = { kind: "idle" };
const PLAYING: SeekState = { kind: "playing" };

export function createSeeker(
  video: SeekTarget,
  /** Called when a seek lands while the user owns the time and nothing waits behind it. */
  onSettled: (time: number) => void,
): Seeker {
  let state: SeekState = IDLE;
  const write = (time: number) => {
    if (video.currentTime !== time) video.currentTime = time;
  };
  /** The user's `time` lands: now when the element is free, else when the running seek does. */
  const want = (time: number) => {
    if (video.seeking) {
      state = { kind: "queued", time };
      return;
    }
    state = IDLE;
    video.currentTime = time;
  };
  const onSeeked = () => {
    switch (state.kind) {
      case "idle":
        onSettled(video.currentTime);
        return;
      case "playing":
        return;
      case "queued":
      case "playing+queued": {
        const { time } = state;
        state = state.kind === "queued" ? IDLE : PLAYING;
        if (video.currentTime !== time) video.currentTime = time;
        else if (state.kind === "idle") onSettled(time);
        return;
      }
      default: {
        const _exhaustive: never = state;
        return _exhaustive;
      }
    }
  };
  // Loading a new source aborts the running seek without a `seeked` event, and a target picked
  // on the old source does not belong on the new one.
  const onEmptied = () => {
    state = state.kind === "playing+queued" ? PLAYING : state.kind === "queued" ? IDLE : state;
  };
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("emptied", onEmptied);
  const playing = () => state.kind === "playing" || state.kind === "playing+queued";
  return {
    seek: want,
    play: () => {
      switch (state.kind) {
        case "idle":
        case "playing":
          state = PLAYING;
          return video.currentTime;
        case "queued":
        case "playing+queued":
          state = { kind: "playing+queued", time: state.time };
          return state.time;
        default: {
          const _exhaustive: never = state;
          return _exhaustive;
        }
      }
    },
    jump: (time) => {
      if (!playing()) return;
      state = PLAYING;
      write(time);
    },
    frame: (time) => {
      if (state.kind !== "playing" || video.seeking) return;
      write(time);
    },
    end: (time) => {
      if (!playing()) return false;
      want(time);
      return true;
    },
    stop: () => {
      if (state.kind === "playing") state = IDLE;
      else if (state.kind === "playing+queued") state = { kind: "queued", time: state.time };
    },
    dispose: () => {
      state = IDLE;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("emptied", onEmptied);
    },
  };
}
