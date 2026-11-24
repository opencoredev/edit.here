import { describe, expect, it } from "vitest";
import { createSeeker, type SeekTarget } from "../src/editors/video/seeker";

/**
 * A media element stand-in: setting `currentTime` starts a seek that `land()` finishes, and
 * `load()` swaps the source, which aborts a running seek without `seeked`, as browsers do.
 */
function fakeVideo() {
  let time = 0;
  let seeking = false;
  const listeners = new Map<string, Set<() => void>>();
  const emit = (type: string) => {
    for (const l of listeners.get(type) ?? []) l();
  };
  const writes: number[] = [];
  const video: SeekTarget & {
    land: () => void;
    load: () => void;
    listenerCount: () => number;
    writes: number[];
  } = {
    get seeking() {
      return seeking;
    },
    get currentTime() {
      return time;
    },
    set currentTime(value: number) {
      time = value;
      writes.push(value);
      seeking = true;
    },
    addEventListener: (type, l) => {
      const set = listeners.get(type) ?? new Set();
      set.add(l);
      listeners.set(type, set);
    },
    removeEventListener: (type, l) => {
      listeners.get(type)?.delete(l);
    },
    land: () => {
      seeking = false;
      emit("seeked");
    },
    load: () => {
      time = 0;
      seeking = false;
      emit("emptied");
    },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    writes,
  };
  return video;
}

function setup() {
  const video = fakeVideo();
  const settled: number[] = [];
  const seeker = createSeeker(video, (t) => settled.push(t));
  return { video, settled, seeker };
}

/** The element is mid-seek to 15 (a scrub that has not landed) and the user scrubs to 7. */
function queuedBehindSeek() {
  const s = setup();
  s.seeker.seek(15);
  s.seeker.seek(7);
  expect(s.video.writes).toEqual([15]);
  return s;
}

describe("createSeeker: user seeks", () => {
  it("idle, seek: writes at once", () => {
    const { video, seeker } = setup();
    seeker.seek(2);
    expect(video.writes).toEqual([2]);
  });

  it("queued, seek: keeps only the latest target and lands on it", () => {
    const { video, settled, seeker } = setup();
    seeker.seek(1);
    seeker.seek(2);
    seeker.seek(3);
    expect(video.writes).toEqual([1]);
    video.land();
    expect(video.writes).toEqual([1, 3]);
    expect(settled).toEqual([]);
    video.land();
    expect(settled).toEqual([3]);
  });

  it("idle, seeked: reports the element's time", () => {
    const { video, settled, seeker } = setup();
    seeker.seek(4);
    video.land();
    expect(settled).toEqual([4]);
  });

  it("queued, seeked on the same time: settles without writing again", () => {
    const { video, settled, seeker } = setup();
    seeker.seek(4);
    seeker.seek(4);
    video.land();
    expect(video.writes).toEqual([4]);
    expect(settled).toEqual([4]);
  });

  it("queued behind a seek it did not start: still lands", () => {
    const { video, settled, seeker } = setup();
    video.currentTime = 15;
    seeker.seek(7);
    video.land();
    expect(video.writes).toEqual([15, 7]);
    video.land();
    expect(settled).toEqual([7]);
  });
});

describe("createSeeker: playback", () => {
  it("idle, play: starts from the element's time", () => {
    const { video, seeker } = setup();
    seeker.seek(3);
    video.land();
    expect(seeker.play()).toBe(3);
  });

  it("queued, play: starts from the queued target", () => {
    const { seeker } = queuedBehindSeek();
    expect(seeker.play()).toBe(7);
  });

  it("playing, frame: writes when the element is free and drops a frame while it seeks", () => {
    const { video, settled, seeker } = setup();
    seeker.play();
    seeker.frame(5);
    seeker.frame(4.9);
    video.land();
    seeker.frame(4.8);
    expect(video.writes).toEqual([5, 4.8]);
    // Playback owns the time, so its own landings do not move the playhead.
    expect(settled).toEqual([]);
  });

  it("idle or queued, frame and jump: ignored (playback does not own the time)", () => {
    const { video, seeker } = queuedBehindSeek();
    seeker.frame(1);
    seeker.jump(2);
    expect(video.writes).toEqual([15]);
    video.land();
    expect(video.writes).toEqual([15, 7]);
  });

  it("playing+queued, frame: drops frames until the queued target lands, then shows them", () => {
    const { video, seeker } = queuedBehindSeek();
    seeker.play();
    seeker.frame(6.9);
    video.land();
    expect(video.writes).toEqual([15, 7]);
    seeker.frame(6.8);
    expect(video.writes).toEqual([15, 7]);
    video.land();
    seeker.frame(6.7);
    expect(video.writes).toEqual([15, 7, 6.7]);
  });

  it("J then K before the running seek lands: the queued target still lands", () => {
    // The review's repro: scrub to 7 behind a seek to 15, press J, then K, then the seek lands.
    const { video, settled, seeker } = queuedBehindSeek();
    let t = seeker.play();
    for (let i = 0; i < 5; i++) {
      t -= 0.03;
      seeker.frame(t);
    }
    seeker.stop();
    expect(video.writes).toEqual([15]);
    video.land();
    expect(video.writes).toEqual([15, 7]);
    video.land();
    expect(settled).toEqual([7]);
  });

  it("playing+queued, jump: forward play starts now and the old target is not applied", () => {
    const { video, settled, seeker } = queuedBehindSeek();
    expect(seeker.play()).toBe(7);
    seeker.jump(7);
    expect(video.writes).toEqual([15, 7]);
    video.land();
    expect(video.writes).toEqual([15, 7]);
    expect(settled).toEqual([]);
  });

  it("playing, jump to the time the element shows: writes nothing", () => {
    const { video, seeker } = setup();
    seeker.seek(3);
    video.land();
    seeker.play();
    seeker.jump(3);
    expect(video.writes).toEqual([3]);
  });

  it("L then K before the start lands: settles on the start", () => {
    const { video, settled, seeker } = queuedBehindSeek();
    seeker.jump(seeker.play());
    seeker.stop();
    video.land();
    expect(video.writes).toEqual([15, 7]);
    expect(settled).toEqual([7]);
  });

  it("J then L: forward starts from the queued target", () => {
    const { video, seeker } = queuedBehindSeek();
    seeker.play();
    seeker.frame(6.9);
    seeker.stop();
    const start = seeker.play();
    expect(start).toBe(7);
    seeker.jump(start);
    video.land();
    expect(video.writes).toEqual([15, 7]);
  });

  it("queued, play then stop with nothing to play (every segment cut): the target lands", () => {
    const { video, settled, seeker } = queuedBehindSeek();
    seeker.play();
    seeker.stop();
    video.land();
    video.land();
    expect(video.writes).toEqual([15, 7]);
    expect(settled).toEqual([7]);
  });

  it("playing, stop: hands the time back, so the next landing moves the playhead", () => {
    const { video, settled, seeker } = setup();
    seeker.play();
    seeker.frame(5);
    seeker.stop();
    video.land();
    expect(settled).toEqual([5]);
  });

  it("playing, seek: the user takes the time back before the loop is torn down", () => {
    // A scrub or frame step pauses playback; a frame or end that runs before the effect
    // cleanup must not overwrite the user's target.
    const { video, settled, seeker } = setup();
    seeker.play();
    seeker.frame(10);
    seeker.seek(4);
    seeker.frame(9.9);
    seeker.jump(12);
    expect(seeker.end(0)).toBe(false);
    seeker.stop();
    video.land();
    video.land();
    expect(video.writes).toEqual([10, 4]);
    expect(settled).toEqual([4]);
  });

  it("playing, end: lands like a seek and reports that playback owned the time", () => {
    const { video, settled, seeker } = setup();
    seeker.play();
    seeker.frame(0.2);
    expect(seeker.end(0)).toBe(true);
    seeker.stop();
    video.land();
    video.land();
    expect(video.writes).toEqual([0.2, 0]);
    expect(settled).toEqual([0]);
  });

  it("playing+queued, end: the end replaces the queued target", () => {
    const { video, settled, seeker } = queuedBehindSeek();
    seeker.play();
    expect(seeker.end(0)).toBe(true);
    seeker.stop();
    video.land();
    video.land();
    expect(video.writes).toEqual([15, 0]);
    expect(settled).toEqual([0]);
  });
});

describe("createSeeker: source and lifetime", () => {
  it("queued, emptied: drops a target from the old source", () => {
    const { video, settled } = queuedBehindSeek();
    video.load();
    // The new source's first seek must not be followed by the old source's target.
    video.currentTime = 0.5;
    video.land();
    expect(video.writes).toEqual([15, 0.5]);
    expect(settled).toEqual([0.5]);
  });

  it("playing+queued, emptied: keeps playing without the old target", () => {
    const { video, seeker } = queuedBehindSeek();
    seeker.play();
    video.load();
    seeker.frame(0.4);
    expect(video.writes).toEqual([15, 0.4]);
  });

  it("dispose: drops the target and stops listening", () => {
    const { video, settled, seeker } = queuedBehindSeek();
    seeker.dispose();
    video.land();
    expect(video.writes).toEqual([15]);
    expect(settled).toEqual([]);
    expect(video.listenerCount()).toBe(0);
  });
});
