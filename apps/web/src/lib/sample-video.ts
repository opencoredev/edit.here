/**
 * The sample clip: 6 s, 1280×720 at 30 fps, three 2-second chapters (Trim, Speed, Audio) drawn on
 * a canvas, with a synthesized stereo score (a warm IV–V–I chord progression over a soft pulse).
 * Every frame and every audio sample is computed here; nothing is fetched.
 */
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  canEncodeAudio,
  canEncodeVideo,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  type VideoCodec,
} from "mediabunny";

const W = 1280;
const H = 720;
const FPS = 30;
const SECONDS = 6;
const CHAPTER = 2;
const SAMPLE_RATE = 48_000;
const TOTAL_FRAMES = SECONDS * FPS;

const UI_FONT = `"Sidebar Inter", system-ui, sans-serif`;
const MONO_FONT = `"JetBrains Mono", ui-monospace, monospace`;

// ---------------------------------------------------------------------------------------------
// Math helpers

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const easeOutCubic = (x: number): number => 1 - (1 - clamp01(x)) ** 3;
const easeInOutCubic = (x: number): number => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
/** Progress of `t` through `[from, to]`, 0..1. */
const span = (t: number, from: number, to: number): number => clamp01((t - from) / (to - from));
const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;

// ---------------------------------------------------------------------------------------------
// Score: computed once, drawn by the Audio chapter and the trim card's waveform.

type Score = {
  readonly left: Float32Array<ArrayBuffer>;
  readonly right: Float32Array<ArrayBuffer>;
  /** RMS level per 10 ms window, 0..1 after normalizing, for drawing waveforms. */
  readonly levels: Float32Array;
};

const LEVEL_WINDOW = 0.01;

/** Fmaj7 → Gadd9 → Cmaj9, one chord per chapter, with a bass root under each. */
const CHORDS: ReadonlyArray<{ readonly bass: number; readonly notes: readonly number[] }> = [
  { bass: 87.31, notes: [174.61, 220.0, 261.63, 329.63] },
  { bass: 98.0, notes: [196.0, 246.94, 293.66, 440.0] },
  { bass: 65.41, notes: [196.0, 246.94, 293.66, 329.63, 523.25] },
];

/** Raised-cosine ramp: 0 → 1 over `length` seconds, no corner at either end. */
function smoothRamp(x: number, length: number): number {
  if (length <= 0) return 1;
  const v = clamp01(x / length);
  return 0.5 - 0.5 * Math.cos(Math.PI * v);
}

const TAU = Math.PI * 2;

/** Frequency ratio for a detune in cents. */
function cents(c: number): number {
  return 2 ** (c / 1200);
}

/** A soft pad voice: a sine with a little second and third harmonic. */
function padVoice(freq: number, t: number): number {
  return (
    Math.sin(TAU * freq * t) +
    0.28 * Math.sin(TAU * 2 * freq * t + 0.4) +
    0.08 * Math.sin(TAU * 3 * freq * t + 1.1)
  );
}

function synthesizeScore(): Score {
  const frames = SECONDS * SAMPLE_RATE;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    let l = 0;
    let r = 0;

    // Pads: each chord swells in, holds, and releases under the next one.
    CHORDS.forEach((chord, index) => {
      const start = index * CHAPTER - (index === 0 ? 0 : 0.18);
      const end = (index + 1) * CHAPTER + (index === CHORDS.length - 1 ? 0 : 0.45);
      if (t < start || t > end) return;
      const env = smoothRamp(t - start, 0.35) * smoothRamp(end - t, 0.55);
      const breathe = 0.85 + 0.15 * Math.sin(TAU * 0.5 * t + index);
      chord.notes.forEach((f, n) => {
        // Slight detune between channels widens the pad without phasing.
        const fl = f * cents(-4 + n);
        const fr = f * cents(4 - n);
        const level = (0.06 / Math.sqrt(chord.notes.length)) * env * breathe;
        l += padVoice(fl, t) * level;
        r += padVoice(fr, t) * level;
      });
      const bass = Math.sin(TAU * chord.bass * t) + 0.18 * Math.sin(TAU * 2 * chord.bass * t);
      l += bass * 0.075 * env;
      r += bass * 0.075 * env;
    });

    // Pulse: a soft low thump on every beat at 120 BPM, and a quiet chord-tone pluck that
    // alternates sides.
    const beat = Math.floor(t / 0.5);
    const sinceBeat = t - beat * 0.5;
    const thumpEnv = smoothRamp(sinceBeat, 0.006) * Math.exp(-sinceBeat / 0.11);
    const thumpFreq = 52 + 38 * Math.exp(-sinceBeat / 0.03);
    const thump = Math.sin(TAU * thumpFreq * sinceBeat) * thumpEnv * 0.16;
    l += thump;
    r += thump;

    const chord = CHORDS[Math.min(CHORDS.length - 1, Math.floor(t / CHAPTER))];
    if (chord !== undefined) {
      const note = chord.notes[beat % chord.notes.length] ?? 261.63;
      const pluckEnv = smoothRamp(sinceBeat, 0.004) * Math.exp(-sinceBeat / 0.22);
      const pluck =
        (Math.sin(TAU * note * 2 * sinceBeat) + 0.3 * Math.sin(TAU * note * 4 * sinceBeat)) *
        pluckEnv *
        0.035;
      const pan = beat % 2 === 0 ? 0.35 : -0.35;
      l += pluck * (1 - pan);
      r += pluck * (1 + pan);
    }

    // Master: short fade-in, long fade-out, so the clip never starts or ends on a click.
    const master = smoothRamp(t, 0.06) * smoothRamp(SECONDS - t, 0.5);
    left[i] = l * master;
    right[i] = r * master;
  }

  let peak = 0;
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
  }
  const gain = peak > 0 ? 0.62 / peak : 1;
  for (let i = 0; i < frames; i++) {
    left[i] = Math.tanh((left[i] ?? 0) * gain * 1.1) / Math.tanh(1.1);
    right[i] = Math.tanh((right[i] ?? 0) * gain * 1.1) / Math.tanh(1.1);
  }

  const windowFrames = Math.round(LEVEL_WINDOW * SAMPLE_RATE);
  const levels = new Float32Array(Math.ceil(frames / windowFrames));
  let maxLevel = 0;
  for (let w = 0; w < levels.length; w++) {
    let sum = 0;
    const from = w * windowFrames;
    const to = Math.min(frames, from + windowFrames);
    for (let i = from; i < to; i++) {
      const mono = ((left[i] ?? 0) + (right[i] ?? 0)) / 2;
      sum += mono * mono;
    }
    const rms = Math.sqrt(sum / Math.max(1, to - from));
    levels[w] = rms;
    maxLevel = Math.max(maxLevel, rms);
  }
  if (maxLevel > 0) for (let w = 0; w < levels.length; w++) levels[w] = (levels[w] ?? 0) / maxLevel;
  return { left, right, levels };
}

/** Level at time `t`, averaged over a few windows so bars move smoothly. */
function levelAt(score: Score, t: number): number {
  const center = Math.round(t / LEVEL_WINDOW);
  let sum = 0;
  let count = 0;
  for (let w = center - 2; w <= center + 2; w++) {
    const value = score.levels[w];
    if (value === undefined) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

// ---------------------------------------------------------------------------------------------
// Drawing

type Theme = {
  readonly base: string;
  readonly glows: ReadonlyArray<{
    readonly color: string;
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly drift: number;
  }>;
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly accent: string;
  readonly dots: string;
};

const THEMES: readonly [Theme, Theme, Theme] = [
  {
    base: "#0f0d14",
    glows: [
      { color: "rgba(153, 116, 184, 0.55)", x: 0.78, y: 0.2, r: 0.62, drift: 0.04 },
      { color: "rgba(213, 173, 255, 0.22)", x: 0.12, y: 0.95, r: 0.5, drift: -0.05 },
    ],
    ink: "#f6f2fc",
    muted: "rgba(226, 216, 240, 0.62)",
    faint: "rgba(226, 216, 240, 0.14)",
    accent: "#d5adff",
    dots: "rgba(255, 255, 255, 0.045)",
  },
  {
    base: "#f3f2f6",
    glows: [
      { color: "rgba(213, 173, 255, 0.55)", x: 0.85, y: 0.1, r: 0.6, drift: -0.05 },
      { color: "rgba(148, 184, 164, 0.45)", x: 0.05, y: 0.9, r: 0.55, drift: 0.05 },
    ],
    ink: "#17171a",
    muted: "rgba(32, 33, 36, 0.58)",
    faint: "rgba(32, 33, 36, 0.1)",
    accent: "#7d43bd",
    dots: "rgba(23, 23, 26, 0.05)",
  },
  {
    base: "#110f0e",
    glows: [
      { color: "rgba(198, 140, 110, 0.42)", x: 0.2, y: 0.15, r: 0.6, drift: 0.05 },
      { color: "rgba(229, 194, 121, 0.22)", x: 0.9, y: 0.85, r: 0.55, drift: -0.04 },
    ],
    ink: "#f8f1ea",
    muted: "rgba(240, 226, 214, 0.6)",
    faint: "rgba(240, 226, 214, 0.13)",
    accent: "#e9b48f",
    dots: "rgba(255, 255, 255, 0.04)",
  },
];

const CHAPTER_NAMES = ["Trim", "Speed", "Audio"] as const;

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: number,
  mono = false,
  tracking = 0,
): void {
  ctx.font = `${weight} ${size}px ${mono ? MONO_FONT : UI_FONT}`;
  ctx.letterSpacing = `${tracking}px`;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, theme: Theme, t: number): void {
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, W, H);
  for (const glow of theme.glows) {
    const cx = (glow.x + Math.sin(t * 0.9) * glow.drift) * W;
    const cy = (glow.y + Math.cos(t * 0.7) * glow.drift) * H;
    const radius = glow.r * W;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, glow.color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }
  // Fine dot grid for a studio-surface texture.
  ctx.fillStyle = theme.dots;
  for (let y = 24; y < H; y += 32) {
    for (let x = 24; x < W; x += 32) ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function drawChrome(ctx: CanvasRenderingContext2D, theme: Theme, chapter: number, t: number): void {
  // Wordmark
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(86, 66, 5, 0, Math.PI * 2);
  ctx.fill();
  setFont(ctx, 19, 600, false, -0.3);
  ctx.fillStyle = theme.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("edit.here", 100, 67);

  setFont(ctx, 14, 500, true);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.muted;
  const seconds = Math.min(SECONDS, t);
  const frame = Math.floor(seconds * FPS) % FPS;
  ctx.fillText(
    `00:0${Math.floor(seconds)}:${String(frame).padStart(2, "0")}  ·  1280×720`,
    W - 80,
    67,
  );

  // Chapter progress: three tracks with a label above each.
  const left = 80;
  const gap = 16;
  const width = (W - left * 2 - gap * 2) / 3;
  const y = H - 60;
  CHAPTER_NAMES.forEach((name, index) => {
    const x = left + index * (width + gap);
    const fill = clamp01((t - index * CHAPTER) / CHAPTER);
    const active = index === chapter;
    setFont(ctx, 13, 500, true);
    ctx.textAlign = "left";
    ctx.fillStyle = active ? theme.ink : theme.muted;
    ctx.fillText(`0${index + 1}`, x, y - 18);
    setFont(ctx, 14, active ? 600 : 500);
    ctx.fillText(name, x + 28, y - 18);
    ctx.fillStyle = theme.faint;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 4, 2);
    ctx.fill();
    if (fill > 0) {
      ctx.fillStyle = active ? theme.accent : theme.muted;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(4, width * fill), 4, 2);
      ctx.fill();
    }
  });
}

/** Words rise and fade in one after another. */
function drawKineticLine(
  ctx: CanvasRenderingContext2D,
  words: readonly string[],
  x: number,
  y: number,
  u: number,
  delay: number,
  color: string,
): void {
  setFont(ctx, 86, 600, false, -3.2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let cursor = x;
  const space = ctx.measureText(" ").width;
  words.forEach((word, index) => {
    const p = easeOutCubic(span(u, delay + index * 0.08, delay + index * 0.08 + 0.55));
    withAlpha(ctx, p, () => {
      ctx.fillStyle = color;
      ctx.fillText(word, cursor, y + (1 - p) * 34);
    });
    cursor += ctx.measureText(word).width + space;
  });
}

function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  draw();
  ctx.restore();
}

function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke: string,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  const frames = Math.floor((seconds - whole) * FPS);
  return `00:0${whole}:${String(frames).padStart(2, "0")}`;
}

/** Chapter 1: kinetic headline and a timeline card whose trim handles glide inward. */
function drawTrimChapter(ctx: CanvasRenderingContext2D, score: Score, u: number): void {
  const theme = THEMES[0];
  drawKineticLine(ctx, ["Cut", "to"], 96, 304, u, 0.05, theme.ink);
  drawKineticLine(ctx, ["the", "moment."], 96, 398, u, 0.18, theme.ink);
  withAlpha(ctx, easeOutCubic(span(u, 0.4, 0.9)), () => {
    setFont(ctx, 21, 400);
    ctx.fillStyle = theme.muted;
    ctx.fillText("Drag the in and out handles. The rest drops away.", 98, 452);
  });

  const enter = easeOutCubic(span(u, 0.12, 0.7));
  const cx = 704;
  const cy = 214 + (1 - enter) * 26;
  const cw = 496;
  const ch = 260;
  withAlpha(ctx, enter, () => {
    panel(ctx, cx, cy, cw, ch, 22, "rgba(255, 255, 255, 0.055)", "rgba(255, 255, 255, 0.1)");
    setFont(ctx, 13, 500, true);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.muted;
    ctx.fillText("sample-clip.webm", cx + 24, cy + 32);

    const tx = cx + 24;
    const tw = cw - 48;
    const ty = cy + 98;
    const th = 72;
    // Filmstrip tiles: a violet → sage → clay gradient, like the three chapters.
    const tiles = 8;
    const gradient = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    gradient.addColorStop(0, "#5d3f80");
    gradient.addColorStop(0.5, "#5f7f6d");
    gradient.addColorStop(1, "#8a6a58");
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 10);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(tx, ty, tw, th);
    for (let i = 1; i < tiles; i++) {
      ctx.fillStyle = "rgba(15, 13, 20, 0.55)";
      ctx.fillRect(tx + (tw / tiles) * i - 1, ty, 2, th);
    }
    for (let i = 0; i < tiles; i++) {
      const glow = ctx.createRadialGradient(
        tx + (tw / tiles) * (i + 0.5),
        ty + th * 0.35,
        0,
        tx + (tw / tiles) * (i + 0.5),
        ty + th * 0.35,
        th * 0.7,
      );
      glow.addColorStop(0, "rgba(255, 255, 255, 0.22)");
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(tx + (tw / tiles) * i, ty, tw / tiles, th);
    }

    const glide = easeInOutCubic(span(u, 0.55, 1.5));
    const inX = tx + tw * lerp(0, 0.2, glide);
    const outX = tx + tw * lerp(1, 0.72, glide);
    // Trimmed-away regions dim under a hatch.
    const dim = (x0: number, x1: number): void => {
      if (x1 - x0 < 0.5) return;
      ctx.fillStyle = "rgba(10, 9, 14, 0.66)";
      ctx.fillRect(x0, ty, x1 - x0, th);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, ty, x1 - x0, th);
      ctx.clip();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 2;
      for (let x = x0 - th; x < x1 + th; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, ty + th);
        ctx.lineTo(x + th, ty);
        ctx.stroke();
      }
      ctx.restore();
    };
    dim(tx, inX);
    dim(outX, tx + tw);
    ctx.restore();

    // Kept range outline and playhead.
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(inX, ty - 1, outX - inX, th + 2, 8);
    ctx.stroke();
    const playX = lerp(inX + 10, outX - 10, (u * 0.6) % 1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(playX - 1, ty - 6, 2, th + 12);

    // Handles with grip lines and timecode badges.
    const handle = (x: number, side: -1 | 1, seconds: number): void => {
      const hx = side === -1 ? x - 7 : x - 7;
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.roundRect(hx, ty - 8, 14, th + 16, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(15, 13, 20, 0.55)";
      for (const dy of [-6, 0, 6]) ctx.fillRect(hx + 4, ty + th / 2 + dy - 1, 6, 2);
      const label = formatClock(seconds);
      setFont(ctx, 12, 500, true);
      const lw = ctx.measureText(label).width + 16;
      const bx = x - lw / 2;
      const by = ty - 40;
      ctx.fillStyle = "rgba(246, 242, 252, 0.96)";
      ctx.beginPath();
      ctx.roundRect(bx, by, lw, 22, 6);
      ctx.fill();
      ctx.fillStyle = "#17171a";
      ctx.textAlign = "center";
      ctx.fillText(label, x, by + 11.5);
    };
    const inSeconds = lerp(0, 0.2, glide) * SECONDS;
    const outSeconds = lerp(1, 0.72, glide) * SECONDS;
    handle(inX, -1, inSeconds);
    handle(outX, 1, outSeconds);

    // Waveform strip from the real score.
    const wy = ty + th + 22;
    const bars = 56;
    const bw = tw / bars;
    for (let i = 0; i < bars; i++) {
      const time = ((i + 0.5) / bars) * SECONDS;
      const level = levelAt(score, time);
      const h = Math.max(2, level * 22);
      const x = tx + i * bw;
      const kept = x + bw / 2 >= inX && x + bw / 2 <= outX;
      ctx.fillStyle = kept ? "rgba(213, 173, 255, 0.75)" : "rgba(255, 255, 255, 0.16)";
      ctx.beginPath();
      ctx.roundRect(x + 1, wy + 12 - h / 2, Math.max(1, bw - 3), h, 1.5);
      ctx.fill();
    }

    setFont(ctx, 13, 500, true);
    ctx.textAlign = "left";
    ctx.fillStyle = theme.muted;
    ctx.fillText(
      `Keeping ${(outSeconds - inSeconds).toFixed(1)}s of ${SECONDS.toFixed(1)}s`,
      tx,
      cy + ch - 24,
    );
  });
}

/** Draws digits in equal-width slots so a ticking number never jitters. */
function drawTabular(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  slot: number,
): number {
  ctx.textAlign = "center";
  let cursor = x;
  for (const char of value) {
    const width = /\d/.test(char) ? slot : ctx.measureText(char).width;
    ctx.fillText(char, cursor + width / 2, y);
    cursor += width;
  }
  return cursor;
}

/** Chapter 2: a light surface with a ticking speed readout, preset pills and a gauge. */
function drawSpeedChapter(ctx: CanvasRenderingContext2D, u: number): void {
  const theme = THEMES[1];
  const enter = easeOutCubic(span(u, 0, 0.5));
  const ramp = easeInOutCubic(span(u, 0.3, 1.45));
  const speed = lerp(0.5, 2, ramp);

  // Speed lines behind the readout.
  withAlpha(ctx, enter, () => {
    for (let i = 0; i < 9; i++) {
      const y = 180 + i * 46;
      const length = 120 + ((i * 53) % 140);
      const loop = W + 400;
      const wrapped = ((((i * 211 - u * 620 * speed) % loop) + loop) % loop) - 200;
      ctx.fillStyle = "rgba(23, 23, 26, 0.05)";
      ctx.beginPath();
      ctx.roundRect(wrapped, y, length, 3, 1.5);
      ctx.fill();
    }
  });

  withAlpha(ctx, enter, () => {
    const lift = (1 - enter) * 24;
    setFont(ctx, 20, 500);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = theme.muted;
    ctx.fillText("Playback speed", 98, 232 + lift);

    setFont(ctx, 168, 600, false, -6);
    ctx.fillStyle = theme.ink;
    const slot = ctx.measureText("0").width;
    const end = drawTabular(ctx, speed.toFixed(2), 90, 404 + lift, slot);
    setFont(ctx, 120, 500, false, -4);
    ctx.fillStyle = theme.accent;
    ctx.textAlign = "left";
    ctx.fillText("×", end + 8, 400 + lift);

    // Preset pills; the one nearest the current speed fills in.
    const presets = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const nearest = presets.reduce((best, p) =>
      Math.abs(p - speed) < Math.abs(best - speed) ? p : best,
    );
    let px = 96;
    const py = 452 + lift;
    setFont(ctx, 16, 500, true);
    for (const preset of presets) {
      const label = `${preset}×`;
      const pw = ctx.measureText(label).width + 28;
      const active = preset === nearest;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, 38, 19);
      ctx.fillStyle = active ? theme.ink : "rgba(255, 255, 255, 0.72)";
      ctx.fill();
      if (!active) {
        ctx.strokeStyle = "rgba(23, 23, 26, 0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = active ? "#fafafa" : theme.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, px + pw / 2, py + 19.5);
      px += pw + 10;
    }
  });

  // Gauge
  const gaugeEnter = easeOutCubic(span(u, 0.1, 0.65));
  withAlpha(ctx, gaugeEnter, () => {
    const gx = 948;
    const gy = 360 + (1 - gaugeEnter) * 24;
    const radius = 168;
    const startAngle = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    panel(
      ctx,
      gx - 220,
      gy - 210,
      440,
      400,
      32,
      "rgba(255, 255, 255, 0.6)",
      "rgba(23, 23, 26, 0.07)",
    );
    ctx.lineCap = "round";
    ctx.lineWidth = 16;
    ctx.strokeStyle = "rgba(23, 23, 26, 0.08)";
    ctx.beginPath();
    ctx.arc(gx, gy, radius - 40, startAngle, startAngle + sweep);
    ctx.stroke();
    const fraction = (speed - 0.25) / (2.5 - 0.25);
    const arc = ctx.createLinearGradient(gx - radius, gy, gx + radius, gy);
    arc.addColorStop(0, "#b487e4");
    arc.addColorStop(1, "#7d43bd");
    ctx.strokeStyle = arc;
    ctx.beginPath();
    ctx.arc(gx, gy, radius - 40, startAngle, startAngle + sweep * fraction);
    ctx.stroke();
    ctx.lineCap = "butt";
    // Ticks every 0.25×
    for (let i = 0; i <= 9; i++) {
      const angle = startAngle + (sweep * i) / 9;
      const major = i % 2 === 1;
      const r0 = radius - 14;
      const r1 = radius - (major ? 0 : 6);
      ctx.strokeStyle = major ? "rgba(23, 23, 26, 0.35)" : "rgba(23, 23, 26, 0.16)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx + Math.cos(angle) * r0, gy + Math.sin(angle) * r0);
      ctx.lineTo(gx + Math.cos(angle) * r1, gy + Math.sin(angle) * r1);
      ctx.stroke();
    }
    const tip = startAngle + sweep * fraction;
    ctx.fillStyle = "#7d43bd";
    ctx.beginPath();
    ctx.arc(
      gx + Math.cos(tip) * (radius - 40),
      gy + Math.sin(tip) * (radius - 40),
      13,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(
      gx + Math.cos(tip) * (radius - 40),
      gy + Math.sin(tip) * (radius - 40),
      5,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    setFont(ctx, 44, 600, false, -1.5);
    ctx.fillStyle = theme.ink;
    ctx.textBaseline = "alphabetic";
    const output = (SECONDS / speed).toFixed(1);
    const slot = ctx.measureText("0").width;
    const width = (output.length - 1) * slot + ctx.measureText(".s").width;
    const after = drawTabular(ctx, output, gx - width / 2, gy + 14, slot);
    ctx.textAlign = "left";
    ctx.fillText("s", after, gy + 14);
    setFont(ctx, 14, 500, true);
    ctx.textAlign = "center";
    ctx.fillStyle = theme.muted;
    ctx.fillText("OUTPUT", gx, gy + 44);
  });
}

/** Chapter 3: a waveform drawn from the score scrolls past a centered playhead. */
function drawAudioChapter(ctx: CanvasRenderingContext2D, score: Score, u: number, t: number): void {
  const theme = THEMES[2];
  drawKineticLine(ctx, ["Hear", "every"], 96, 256, u, 0.05, theme.ink);
  drawKineticLine(ctx, ["frame."], 96, 350, u, 0.18, theme.ink);

  // Control card: volume slider and fade chips.
  const enter = easeOutCubic(span(u, 0.15, 0.7));
  withAlpha(ctx, enter, () => {
    const cx = 752;
    const cy = 150 + (1 - enter) * 24;
    const cw = 432;
    panel(ctx, cx, cy, cw, 196, 22, "rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.1)");
    const volume = lerp(100, 140, easeInOutCubic(span(u, 0.6, 1.4)));
    setFont(ctx, 15, 500);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.muted;
    ctx.fillText("Volume", cx + 26, cy + 38);
    setFont(ctx, 15, 500, true);
    ctx.textAlign = "right";
    ctx.fillStyle = theme.ink;
    ctx.fillText(`${Math.round(volume)}%`, cx + cw - 26, cy + 38);
    const sx = cx + 26;
    const sw = cw - 52;
    const sy = cy + 70;
    ctx.fillStyle = theme.faint;
    ctx.beginPath();
    ctx.roundRect(sx, sy - 3, sw, 6, 3);
    ctx.fill();
    const knob = sx + (sw * volume) / 200;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.roundRect(sx, sy - 3, knob - sx, 6, 3);
    ctx.fill();
    ctx.fillStyle = "#fff7f0";
    ctx.beginPath();
    ctx.arc(knob, sy, 10, 0, Math.PI * 2);
    ctx.fill();

    const chips: ReadonlyArray<[string, readonly string[], number]> = [
      ["Fade in", ["Off", "0.5s", "1s"], 1],
      ["Fade out", ["Off", "1s", "2s"], 2],
    ];
    chips.forEach(([label, options, active], row) => {
      const ry = cy + 116 + row * 44;
      setFont(ctx, 14, 500);
      ctx.textAlign = "left";
      ctx.fillStyle = theme.muted;
      ctx.fillText(label, cx + 26, ry);
      let ox = cx + cw - 26;
      setFont(ctx, 13, 500, true);
      for (let i = options.length - 1; i >= 0; i--) {
        const text = options[i] ?? "";
        const ow = ctx.measureText(text).width + 22;
        ox -= ow;
        const on = i === active && u > 0.9 + row * 0.25;
        ctx.beginPath();
        ctx.roundRect(ox, ry - 14, ow, 28, 8);
        ctx.fillStyle = on ? theme.accent : "rgba(255, 255, 255, 0.06)";
        ctx.fill();
        ctx.fillStyle = on ? "#1a1411" : theme.ink;
        ctx.textAlign = "center";
        ctx.fillText(text, ox + ow / 2, ry + 0.5);
        ox -= 6;
      }
    });
  });

  // Waveform: bars sample the score around the current time; the centre is "now".
  const waveEnter = easeOutCubic(span(u, 0.25, 0.8));
  withAlpha(ctx, waveEnter, () => {
    const bars = 76;
    const left = 96;
    const width = W - left * 2;
    const bw = width / bars;
    const mid = 500;
    for (let i = 0; i < bars; i++) {
      const offset = (i - bars / 2) * 0.035;
      const time = t + offset;
      const level = time < 0 || time > SECONDS ? 0 : levelAt(score, time);
      const h = Math.max(4, level * 150 * waveEnter);
      const distance = Math.abs(i - bars / 2) / (bars / 2);
      const past = offset < 0;
      ctx.globalAlpha = (past ? 0.95 : 0.45) * (1 - distance * 0.55);
      const gradient = ctx.createLinearGradient(0, mid - h / 2, 0, mid + h / 2);
      gradient.addColorStop(0, "#f2c48f");
      gradient.addColorStop(1, "#c6846e");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(left + i * bw + 2, mid - h / 2, bw - 4, h, 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255, 247, 240, 0.9)";
    ctx.fillRect(W / 2 - 1, mid - 96, 2, 192);
    ctx.beginPath();
    ctx.arc(W / 2, mid - 96, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawChapter(
  ctx: CanvasRenderingContext2D,
  score: Score,
  chapter: number,
  t: number,
): void {
  const theme = THEMES[chapter] ?? THEMES[0];
  drawBackdrop(ctx, theme, t);
  drawChrome(ctx, theme, chapter, t);
  const u = t - chapter * CHAPTER;
  // Content leaves over the last 0.25 s of a chapter (the final chapter holds to the end).
  const exit = chapter === CHAPTER_NAMES.length - 1 ? 1 : 1 - easeInOutCubic(span(u, 1.75, 2));
  withAlpha(ctx, exit, () => {
    // The opening chapter starts mid-entrance so the first frame (the poster) is never empty.
    if (chapter === 0) drawTrimChapter(ctx, score, u + 0.3);
    else if (chapter === 1) drawSpeedChapter(ctx, u);
    else drawAudioChapter(ctx, score, u, t);
  });
}

function drawFrame(ctx: CanvasRenderingContext2D, score: Score, frame: number): void {
  const t = frame / FPS;
  const chapter = Math.min(CHAPTER_NAMES.length - 1, Math.floor(t / CHAPTER));
  ctx.save();
  drawChapter(ctx, score, chapter, t);
  // Cross-dissolve into the next chapter's surface over the last 0.2 s.
  const next = chapter + 1;
  if (next < CHAPTER_NAMES.length) {
    const blend = easeInOutCubic(span(t, next * CHAPTER - 0.2, next * CHAPTER));
    withAlpha(ctx, blend, () => drawChapter(ctx, score, next, t));
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Encoding

function createAudioBuffer(score: Score, from: number, to: number): AudioBuffer {
  const length = to - from;
  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
  buffer.copyToChannel(score.left.subarray(from, to), 0);
  buffer.copyToChannel(score.right.subarray(from, to), 1);
  return buffer;
}

async function pickVideoCodec(): Promise<VideoCodec | null> {
  for (const codec of ["vp9", "vp8"] as const) {
    if (await canEncodeVideo(codec, { width: W, height: H })) return codec;
  }
  return null;
}

async function encodeWithWebCodecs(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  score: Score,
): Promise<Blob | null> {
  if (typeof VideoEncoder === "undefined") return null;
  const codec = await pickVideoCodec();
  if (codec === null) return null;
  const withAudio =
    typeof AudioBuffer !== "undefined" &&
    (await canEncodeAudio("opus", { numberOfChannels: 2, sampleRate: SAMPLE_RATE }));

  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 0.5 });
  output.addVideoTrack(video, { frameRate: FPS });
  const audio = withAudio ? new AudioBufferSource({ codec: "opus", bitrate: QUALITY_HIGH }) : null;
  if (audio !== null) output.addAudioTrack(audio);
  await output.start();

  // Interleave half-second audio chunks with the frames they accompany.
  const chunkFrames = SAMPLE_RATE / 2;
  const totalAudio = score.left.length;
  let audioCursor = audio === null ? totalAudio : 0;
  const addAudioUntil = async (time: number): Promise<void> => {
    if (audio === null) return;
    while (audioCursor < totalAudio && audioCursor / SAMPLE_RATE <= time) {
      const end = Math.min(totalAudio, audioCursor + chunkFrames);
      await audio.add(createAudioBuffer(score, audioCursor, end));
      audioCursor = end;
    }
  };
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const t = frame / FPS;
    await addAudioUntil(t);
    drawFrame(ctx, score, frame);
    await video.add(t, 1 / FPS);
  }
  await addAudioUntil(Number.POSITIVE_INFINITY);
  await output.finalize();
  const buffer = output.target.buffer;
  return buffer === null ? null : new Blob([buffer], { type: "video/webm" });
}

/** The score as a live track for MediaRecorder, or null when Web Audio isn't available. */
function startScoreStream(score: Score): {
  readonly track: MediaStreamTrack;
  readonly start: () => void;
  readonly stop: () => void;
} | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (typeof context.createMediaStreamDestination !== "function") {
      void context.close();
      return null;
    }
    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    source.buffer = createAudioBuffer(score, 0, score.left.length);
    source.connect(destination);
    const [track] = destination.stream.getAudioTracks();
    if (track === undefined) {
      void context.close();
      return null;
    }
    return {
      track,
      start: () => {
        void context.resume();
        source.start();
      },
      stop: () => {
        track.stop();
        void context.close();
      },
    };
  } catch {
    return null;
  }
}

/**
 * Real-time fallback for browsers without WebCodecs. MediaRecorder WebM files have no
 * duration header, so editors must probe the duration (e.g. with mediabunny) for these.
 */
function recordWithMediaRecorder(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  score: Score,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
      reject(new Error("This browser can't record video from a canvas."));
      return;
    }
    const stream = canvas.captureStream(FPS);
    const audio = startScoreStream(score);
    if (audio !== null) stream.addTrack(audio.track);
    const candidates =
      audio === null
        ? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    if (mimeType === undefined) {
      audio?.stop();
      reject(new Error("This browser can't record WebM video."));
      return;
    }
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      audio?.stop();
      reject(new Error("Recording the sample video failed."));
    });
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      audio?.stop();
      resolve(new Blob(chunks, { type: "video/webm" }));
    });

    const startedAt = performance.now();
    drawFrame(ctx, score, 0);
    recorder.start(250);
    audio?.start();
    const tick = (): void => {
      const frame = Math.floor(((performance.now() - startedAt) / 1000) * FPS);
      if (frame >= TOTAL_FRAMES) {
        recorder.stop();
        return;
      }
      drawFrame(ctx, score, frame);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function ensureFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.allSettled([
    document.fonts.load(`400 16px ${UI_FONT}`),
    document.fonts.load(`600 16px ${UI_FONT}`),
    document.fonts.load(`500 16px ${MONO_FONT}`),
  ]);
}

export async function createSampleVideoFile(): Promise<File> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas 2D is not available in this browser.");
  const score = synthesizeScore();
  let blob: Blob | null = null;
  try {
    blob = await encodeWithWebCodecs(canvas, ctx, score);
  } catch {
    blob = null;
  }
  blob ??= await recordWithMediaRecorder(canvas, ctx, score);
  return new File([blob], "sample-clip.webm", { type: "video/webm", lastModified: Date.now() });
}
