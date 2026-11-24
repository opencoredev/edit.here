/**
 * Local sample files so a first-time visitor can try every editor without uploading anything.
 * Everything here runs in the browser; nothing is fetched.
 */
const SAMPLE_API_TOKEN = "sk_demo_98a7f6e5d4c3b2a1f0e9d8c7b6a5";
const SAMPLE_EMAIL = "alex@acme.dev";

const UI_FONT = `"Sidebar Inter", system-ui, sans-serif`;
const MONO_FONT = `"JetBrains Mono", ui-monospace, monospace`;

/** Sample artwork palette, taken from the Alloy theme's dark-mode colors. */
const ALLOY = {
  canvas: "#171719",
  panel: "#202023",
  raised: "#2a2a2e",
  line: "#3b3b40",
  muted: "#80808a",
  text: "#e8e8ed",
  bright: "#fafafa",
  brand: "#d5adff",
  brandDeep: "#9974b8",
  sage: "#94b8a4",
  clay: "#c6a492",
  ok: "#8fd5ad",
  warn: "#e5c279",
  error: "#f49fa5",
} as const;

function createCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas 2D is not available in this browser.");
  return { canvas, ctx };
}

/** Waits for the app fonts so sample text renders in Inter and JetBrains Mono, not a fallback. */
async function ensureFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.allSettled([
    document.fonts.load(`500 16px ${UI_FONT}`),
    document.fonts.load(`600 16px ${UI_FONT}`),
    document.fonts.load(`400 16px ${MONO_FONT}`),
  ]);
}

function roundRect(args: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill?: string;
  stroke?: string;
}): void {
  const { ctx } = args;
  ctx.beginPath();
  ctx.roundRect(args.x, args.y, args.width, args.height, args.radius);
  if (args.fill !== undefined) {
    ctx.fillStyle = args.fill;
    ctx.fill();
  }
  if (args.stroke !== undefined) {
    ctx.strokeStyle = args.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  style: { size: number; color: string; weight?: number; mono?: boolean; align?: CanvasTextAlign },
): void {
  ctx.font = `${style.weight ?? 400} ${style.size}px ${style.mono === true ? MONO_FONT : UI_FONT}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error("Could not encode the sample image."));
      else resolve(blob);
    }, type);
  });
}

// ---------------------------------------------------------------------------
// Image: a developer dashboard with a live API key and an email to crop and redact.

export async function createSampleImageFile(): Promise<File> {
  await ensureFonts();
  const W = 1600;
  const H = 1000;
  const { canvas, ctx } = createCanvas(W, H);

  // Window
  ctx.fillStyle = "#0f0f11";
  ctx.fillRect(0, 0, W, H);
  roundRect({ ctx, x: 0, y: 0, width: W, height: 52, radius: 0, fill: ALLOY.panel });
  ["#f49fa5", "#e5c279", "#8fd5ad"].forEach((color, i) => {
    ctx.beginPath();
    ctx.arc(28 + i * 22, 26, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
  roundRect({ ctx, x: 520, y: 12, width: 560, height: 28, radius: 8, fill: ALLOY.raised });
  text(ctx, "dashboard.acme.dev/settings/api-keys", 800, 31, {
    size: 14,
    color: ALLOY.muted,
    align: "center",
  });

  // Sidebar
  ctx.fillStyle = "#141416";
  ctx.fillRect(0, 52, 260, H - 52);
  roundRect({ ctx, x: 24, y: 80, width: 32, height: 32, radius: 8, fill: ALLOY.brand });
  text(ctx, "A", 40, 102, { size: 17, color: ALLOY.canvas, weight: 600, align: "center" });
  text(ctx, "Acme Cloud", 68, 102, { size: 17, color: ALLOY.bright, weight: 600 });
  const nav = ["Overview", "Deployments", "Logs", "API keys", "Webhooks", "Billing", "Team"];
  nav.forEach((item, i) => {
    const y = 160 + i * 44;
    if (item === "API keys") {
      roundRect({ ctx, x: 16, y: y - 26, width: 228, height: 38, radius: 8, fill: ALLOY.raised });
      ctx.fillStyle = ALLOY.brand;
      ctx.fillRect(16, y - 26, 3, 38);
    }
    text(ctx, item, 36, y, {
      size: 15,
      color: item === "API keys" ? ALLOY.bright : ALLOY.muted,
      weight: item === "API keys" ? 500 : 400,
    });
  });
  roundRect({ ctx, x: 16, y: H - 84, width: 228, height: 60, radius: 10, fill: ALLOY.panel });
  ctx.beginPath();
  ctx.arc(46, H - 54, 16, 0, Math.PI * 2);
  ctx.fillStyle = ALLOY.sage;
  ctx.fill();
  text(ctx, "AK", 46, H - 49, { size: 12, color: ALLOY.canvas, weight: 600, align: "center" });
  text(ctx, "Alex Kim", 72, H - 59, { size: 14, color: ALLOY.text, weight: 500 });
  text(ctx, SAMPLE_EMAIL, 72, H - 39, { size: 13, color: ALLOY.muted });

  // Header
  text(ctx, "API keys", 300, 120, { size: 30, color: ALLOY.bright, weight: 600 });
  text(
    ctx,
    "Secret keys can read and write every resource in the production workspace.",
    300,
    150,
    {
      size: 15,
      color: ALLOY.muted,
    },
  );
  roundRect({ ctx, x: 1404, y: 88, width: 160, height: 40, radius: 8, fill: ALLOY.brand });
  text(ctx, "+ Create key", 1484, 114, {
    size: 15,
    color: ALLOY.canvas,
    weight: 600,
    align: "center",
  });

  // Stats row
  const stats: Array<[string, string, string]> = [
    ["Requests (24h)", "1,284,903", ALLOY.ok],
    ["Error rate", "0.42%", ALLOY.warn],
    ["p95 latency", "182 ms", ALLOY.brand],
    ["Active keys", "4", ALLOY.sage],
  ];
  stats.forEach(([label, value, color], i) => {
    const x = 300 + i * 318;
    roundRect({
      ctx,
      x,
      y: 180,
      width: 300,
      height: 112,
      radius: 12,
      fill: ALLOY.panel,
      stroke: ALLOY.line,
    });
    text(ctx, label, x + 20, 214, { size: 14, color: ALLOY.muted });
    text(ctx, value, x + 20, 258, { size: 30, color: ALLOY.bright, weight: 600 });
    for (let b = 0; b < 14; b++) {
      const h = 10 + ((Math.sin(b * 1.7 + i) + 1) / 2) * 34;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35 + (b / 14) * 0.65;
      ctx.fillRect(x + 168 + b * 9, 272 - h, 5, h);
    }
    ctx.globalAlpha = 1;
  });

  // Keys table
  roundRect({
    ctx,
    x: 300,
    y: 316,
    width: 1264,
    height: 300,
    radius: 12,
    fill: ALLOY.panel,
    stroke: ALLOY.line,
  });
  const cols = [324, 560, 1140, 1330];
  ["NAME", "SECRET KEY", "CREATED", "LAST USED"].forEach((h, i) => {
    text(ctx, h, cols[i] ?? 0, 352, { size: 12, color: ALLOY.muted, weight: 600 });
  });
  ctx.fillStyle = ALLOY.line;
  ctx.fillRect(300, 368, 1264, 1);
  const rows: Array<[string, string, string, string, boolean]> = [
    ["Production", SAMPLE_API_TOKEN, "Mar 02, 2026", "2 min ago", true],
    ["Staging", "sk_test_••••••••••••••••4f1c", "Jan 18, 2026", "1 hour ago", false],
    ["CI deploy bot", "sk_live_••••••••••••••••9e0a", "Dec 04, 2025", "Yesterday", false],
    ["Analytics export", "rk_live_••••••••••••••••77b2", "Nov 11, 2025", "6 days ago", false],
  ];
  rows.forEach(([name, key, created, used, revealed], i) => {
    const y = 412 + i * 54;
    if (revealed) {
      roundRect({ ctx, x: 310, y: y - 30, width: 1244, height: 46, radius: 8, fill: "#2b2236" });
    }
    text(ctx, name, cols[0] ?? 0, y, { size: 15, color: ALLOY.text, weight: 500 });
    text(ctx, key, cols[1] ?? 0, y, {
      size: 15,
      color: revealed ? ALLOY.brand : ALLOY.muted,
      mono: true,
    });
    text(ctx, created, cols[2] ?? 0, y, { size: 14, color: ALLOY.muted });
    text(ctx, used, cols[3] ?? 0, y, { size: 14, color: ALLOY.muted });
  });

  // Terminal
  roundRect({
    ctx,
    x: 300,
    y: 640,
    width: 1264,
    height: 330,
    radius: 12,
    fill: "#0b0b0d",
    stroke: ALLOY.line,
  });
  text(ctx, "zsh — alex@acme-mbp", 932, 668, { size: 13, color: ALLOY.muted, align: "center" });
  const lines: Array<[string, string]> = [
    ["$ ", `export ACME_SECRET_KEY=${SAMPLE_API_TOKEN}`],
    ["$ ", `curl https://api.acme.dev/v1/charges -u $ACME_SECRET_KEY: -d amount=4900`],
    ["", "{"],
    ["", `  "id": "ch_3PqL9x2eZvKYlo2C",`],
    ["", `  "amount": 4900,`],
    ["", `  "receipt_email": "${SAMPLE_EMAIL}",`],
    ["", `  "status": "succeeded"`],
    ["", "}"],
  ];
  lines.forEach(([prompt, line], i) => {
    const y = 712 + i * 30;
    if (prompt !== "") text(ctx, prompt, 328, y, { size: 16, color: ALLOY.ok, mono: true });
    text(ctx, line, prompt === "" ? 328 : 350, y, {
      size: 16,
      color: i < 2 ? ALLOY.text : ALLOY.sage,
      mono: true,
    });
  });
  ctx.fillStyle = ALLOY.brand;
  ctx.fillRect(350, 712 + lines.length * 30 - 16, 10, 20);

  const blob = await canvasToBlob(canvas, "image/png");
  return new File([blob], "sample-dashboard.png", { type: "image/png", lastModified: Date.now() });
}

// ---------------------------------------------------------------------------
// Video: see sample-video.ts.

export { createSampleVideoFile } from "./sample-video";
