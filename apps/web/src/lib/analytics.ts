/**
 * Databuddy's standard tracker (https://www.databuddy.cc/docs) on edit.here: page views and Web
 * Vitals, plus the product events and error codes below. It sets no cookies. Files never leave the device, and nothing sent carries a file name, a path, file
 * bytes, anything the visitor typed, or anything else about them.
 *
 * databuddy.js is never fetched:
 *   - on a build without `VITE_DATABUDDY_CLIENT_ID` (only the production deploy sets it) or a dev
 *     build;
 *   - away from https://edit.here (a production build on localhost, a Tailscale preview or a
 *     *.vercel.app preview);
 *   - when the visitor opted out with Global Privacy Control or Do Not Track ("1" or "yes" in
 *     navigator.doNotTrack, window.doNotTrack or navigator.msDoNotTrack).
 * In the last two cases `window.databuddyDisabled` is set and no tag is added, so the browser asks
 * nothing of Databuddy. Same rule as apmjs.dev (apmjs commit 44a5221, apps/web/lib/analytics.ts).
 *
 * What databuddy.js itself is allowed to collect (checked against the live script, Nov 2026):
 *   - interaction tracking is OFF (`data-track-interactions="false"`). It is on by default and
 *     records the aria-label or text of rage-clicked and dead-clicked elements and form fields,
 *     which on edit.here includes file names (the Recent projects buttons).
 *   - `[data-track]` attribute tracking is OFF (`data-track-attributes="false"`).
 *   - outgoing-link tracking is OFF (`data-track-outgoing-links="false"`): it sends the clicked
 *     link's text.
 *   - its own error capture is OFF (`data-track-errors="false"`). It sends the raw message,
 *     script URL and stack to /errors and has no hook to filter them. Instead this module listens
 *     for `error` and `unhandledrejection` itself and sends a `js_error` custom event (it lands
 *     in Databuddy's custom events, not its error spans). That event carries exactly three values,
 *     each from a closed list: where it was caught (`source`), the error's name if it is a
 *     standard one (`name`), and a fixed `code` it is classified into. The same error is also
 *     posted to Databuddy's error intake (its Errors page) as a row whose message is that code and
 *     source, whose type is the safe name and whose page is "/", with no stack, file, line or
 *     column. No text from the message or the stack is ever sent.
 *
 * Module-level code only reads `import.meta.env`, so tests import this without a DOM.
 */

export const DATABUDDY_SCRIPT_URL = "https://cdn.databuddy.cc/databuddy.js";

/** The one origin that reports. A copy of the build anywhere else loads nothing. */
export const CANONICAL_ORIGIN = "https://edit.here";

/** Marks the one databuddy.js tag this module adds. */
export const DATABUDDY_TAG_MARK = "data-edit-here-databuddy";

/** The tracker settings on the tag, as databuddy.js reads them (data-<kebab-case option>). */
export const DATABUDDY_SETTINGS = {
  "data-track-web-vitals": "true",
  "data-track-outgoing-links": "false",
  "data-track-interactions": "false",
  "data-track-attributes": "false",
  "data-track-errors": "false",
} as const satisfies Readonly<Record<`data-${string}`, "true" | "false">>;

/** Events queued while databuddy.js is still downloading. Older ones drop past this. */
const MAX_QUEUED = 50;

/** Errors reported per page load; a render loop that throws must not flood the queue. */
const MAX_ERRORS_PER_PAGE = 20;

// --- event schema -------------------------------------------------------------------------

const MEDIA_KINDS = ["image", "video"] as const;
const OPEN_SOURCES = ["file", "sample", "recent", "restore"] as const;
const PLACEMENTS = ["home", "image", "video"] as const;
const ERROR_SOURCES = ["app", "editor", "export", "window", "promise"] as const;
const TOOLS = [
  "pen",
  "highlighter",
  "arrow",
  "rectangle",
  "text",
  "crop",
  "redact",
  "frame",
  "trim",
  "speed",
  "audio",
] as const;
const DISPLAY_MODES = ["browser", "standalone"] as const;
const NETWORK_STATES = ["online", "offline"] as const;

/** Error names that are sent as is. Any other name (a custom class, a library's) becomes "Error". */
export const SAFE_ERROR_NAMES = [
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "URIError",
  "EvalError",
  "DOMException",
  "AbortError",
  "QuotaExceededError",
  "SecurityError",
  "NotAllowedError",
  "NotReadableError",
  "EncodingError",
  "InvalidStateError",
  "DataError",
] as const;

export type SafeErrorName = (typeof SAFE_ERROR_NAMES)[number];

/** What went wrong, from a fixed list. The only description of an error that is ever sent. */
export const ERROR_CODES = [
  "chunk_load_failed",
  "quota_exceeded",
  "decode_failed",
  "encode_failed",
  "clipboard_denied",
  "unsupported_media",
  "aborted",
  "network_error",
  "out_of_memory",
  "storage_error",
  "runtime_error",
  "unknown",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Reads one property; `undefined` means the value is not allowed and the event is dropped. */
type Field<T extends string> = (value: unknown) => T | undefined;

function oneOf<const T extends string>(values: readonly T[]): Field<T> {
  return (value) => values.find((allowed) => allowed === value);
}

/** The export formats reported. Anything else is dropped, never sent as is. */
const EXPORT_FORMATS = ["png", "jpeg", "webp", "mp4", "webm"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The editors' format ids (MIME types for images, short names for video) as reported formats. */
const EXPORT_FORMAT_IDS: ReadonlyMap<string, ExportFormat> = new Map<string, ExportFormat>([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ...EXPORT_FORMATS.map((format): [string, ExportFormat] => [format, format]),
]);

/** An editor's format id as a reported format ("image/png" -> "png"), or `undefined`. */
export function normalizeExportFormat(id: unknown): ExportFormat | undefined {
  return typeof id === "string" ? EXPORT_FORMAT_IDS.get(id) : undefined;
}

const exportFormat: Field<ExportFormat> = (value) => normalizeExportFormat(value);

/**
 * Every event and the only properties it may carry. `trackEvent` builds a fresh object from these
 * keys alone and drops the event if any value fails its check, so extra properties never pass.
 */
const EVENT_SCHEMA = {
  editor_opened: { kind: oneOf(MEDIA_KINDS), source: oneOf(OPEN_SOURCES) },
  export_completed: { kind: oneOf(MEDIA_KINDS), format: exportFormat },
  export_failed: { kind: oneOf(MEDIA_KINDS), format: exportFormat },
  image_copied: { kind: oneOf(MEDIA_KINDS) },
  tool_used: { kind: oneOf(MEDIA_KINDS), tool: oneOf(TOOLS) },
  app_started: { display: oneOf(DISPLAY_MODES), network: oneOf(NETWORK_STATES) },
  pwa_installed: {},
  star_prompt_shown: { placement: oneOf(PLACEMENTS) },
  star_prompt_clicked: { placement: oneOf(PLACEMENTS) },
  star_prompt_dismissed: { placement: oneOf(PLACEMENTS) },
  js_error: {
    source: oneOf(ERROR_SOURCES),
    name: oneOf(SAFE_ERROR_NAMES),
    code: oneOf(ERROR_CODES),
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Field<string>>>>>;

type Schema = typeof EVENT_SCHEMA;

export type AnalyticsEventName = keyof Schema;

/** Each event's properties, derived from EVENT_SCHEMA. */
export type AnalyticsEvents = {
  readonly [N in AnalyticsEventName]: {
    readonly [K in keyof Schema[N]]: Schema[N][K] extends Field<infer T> ? T : never;
  };
};

export type OpenSource = (typeof OPEN_SOURCES)[number];
export type StarPromptPlacement = (typeof PLACEMENTS)[number];
export type ErrorSource = (typeof ERROR_SOURCES)[number];
export type ErrorContext = { readonly source: ErrorSource };
export type ToolName = (typeof TOOLS)[number];

/** Events sent at most once per page load and set of properties (a tool picked again is not new). */
const ONCE_PER_PAGE: ReadonlySet<AnalyticsEventName> = new Set(["tool_used", "app_started"]);

/** Databuddy's error intake: rows here are what its Errors page and error_spans show. */
export const DATABUDDY_ERRORS_URL = "https://basket.databuddy.cc/errors";

/**
 * The one error row sent to Databuddy's error tracking for a reported error. Its message is the
 * fixed code and its type the safe name; the page is always "/", and there is no stack, file
 * name, line or column, so nothing about the visitor or their file can reach it.
 */
export function errorSpan(
  properties: AnalyticsEvents["js_error"],
  ids: { readonly anonId: string | null; readonly sessionId: string | null },
  eventId: string,
  timestamp: number,
): Record<string, string | number> {
  const span: Record<string, string | number> = {
    eventId,
    timestamp,
    path: "/",
    message: `${properties.code} (${properties.source})`,
    errorType: properties.name,
  };
  if (ids.anonId !== null) span.anonymousId = ids.anonId;
  if (ids.sessionId !== null) span.sessionId = ids.sessionId;
  return span;
}

/** Whether `name` is one of the schema's own events (inherited keys like "toString" are not). */
export function isEventName(name: unknown): name is AnalyticsEventName {
  return typeof name === "string" && Object.hasOwn(EVENT_SCHEMA, name);
}

/**
 * The properties actually sent for `name`: a new plain object with only the schema's keys, or
 * `null` when a value is missing or not allowed. Works on anything, so a cast can't slip extra
 * properties through.
 */
export function pickEventProperties(
  name: unknown,
  properties: unknown,
): Record<string, string> | null {
  // `name` is untrusted at runtime: "toString" or "__proto__" would find Object.prototype.
  if (!isEventName(name) || typeof properties !== "object" || properties === null) return null;
  const fields: Readonly<Record<string, Field<string>>> = EVENT_SCHEMA[name];
  const picked: Record<string, string> = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = field(Reflect.get(properties, key));
    if (value === undefined) return null;
    picked[key] = value;
  }
  return picked;
}

// --- error classification ------------------------------------------------------------

/**
 * How to recognize each code from an error's name and message, checked in order. The message is
 * only matched here, in the browser; no part of it is ever sent.
 */
const ERROR_RULES: readonly {
  readonly code: ErrorCode;
  readonly names?: readonly string[];
  readonly message?: RegExp;
}[] = [
  { code: "aborted", names: ["AbortError"] },
  { code: "quota_exceeded", names: ["QuotaExceededError"], message: /quota/i },
  {
    code: "chunk_load_failed",
    names: ["ChunkLoadError"],
    message:
      /dynamically imported module|importing a module script failed|error loading dynamically imported|loading (?:css )?chunk/i,
  },
  {
    code: "clipboard_denied",
    names: ["NotAllowedError"],
    message: /clipboard.*(?:denied|permission|not allowed)|write permission/i,
  },
  {
    code: "storage_error",
    names: ["VersionError", "TransactionInactiveError", "ConstraintError", "UnknownError"],
    message: /indexeddb|idb|object store|transaction/i,
  },
  {
    code: "out_of_memory",
    message: /out of memory|could not allocate|allocation failed|array buffer allocation/i,
  },
  { code: "decode_failed", names: ["EncodingError"], message: /decod/i },
  { code: "encode_failed", message: /encod|toblob|converttoblob/i },
  {
    code: "unsupported_media",
    names: ["NotSupportedError"],
    message: /unsupported|not supported|codec/i,
  },
  {
    code: "network_error",
    names: ["NetworkError"],
    message: /network|failed to fetch|load failed/i,
  },
];

/** Standard JavaScript errors with nothing more specific to say. */
const RUNTIME_ERROR_NAMES: ReadonlySet<string> = new Set([
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
]);

/**
 * The code for anything thrown. Reads the error's name and message to choose, and returns only
 * one of ERROR_CODES; an export failure nothing else explains counts as encode_failed.
 */
export function classifyError(error: unknown, source: ErrorSource = "app"): ErrorCode {
  const name = error instanceof Error ? String(error.name) : "";
  const message =
    error instanceof Error ? String(error.message) : typeof error === "string" ? error : "";
  // A recognized name is more certain than a phrase in the message, so names go first.
  for (const rule of ERROR_RULES) if (rule.names?.includes(name) === true) return rule.code;
  for (const rule of ERROR_RULES) if (rule.message?.test(message) === true) return rule.code;
  if (RUNTIME_ERROR_NAMES.has(name)) return "runtime_error";
  return source === "export" ? "encode_failed" : "unknown";
}

/** The name if it is a standard one, else "Error". */
export function safeErrorName(name: unknown): SafeErrorName {
  return SAFE_ERROR_NAMES.find((allowed) => allowed === name) ?? "Error";
}

/** The js_error properties for anything thrown. */
export function errorProperties(
  error: unknown,
  context: ErrorContext,
): AnalyticsEvents["js_error"] {
  if (error instanceof Error) {
    return {
      source: context.source,
      name: safeErrorName(error.name),
      code: classifyError(error, context.source),
    };
  }
  return {
    source: context.source,
    name: "Error",
    code: classifyError(error, context.source),
  };
}

// --- browser surface ----------------------------------------------------------------------

/** What the loader can see of where the page is and the visitor's opt-outs. */
export type BrowserView = {
  readonly origin: string;
  /** navigator.globalPrivacyControl. */
  readonly globalPrivacyControl: unknown;
  /** navigator.doNotTrack, window.doNotTrack and navigator.msDoNotTrack, in that order. */
  readonly doNotTrack: readonly unknown[];
};

const DNT_ON: ReadonlySet<unknown> = new Set(["1", "yes"]);

/** Whether the visitor opted out with Global Privacy Control or Do Not Track. */
export function optedOut(view: BrowserView): boolean {
  return view.globalPrivacyControl === true || view.doNotTrack.some((value) => DNT_ON.has(value));
}

/** Whether this page may load the tracker: at the canonical origin, with no opt-out. */
export function mayLoad(view: BrowserView): boolean {
  return view.origin === CANONICAL_ORIGIN && !optedOut(view);
}

/** Something the loader can wait on: the `<script>` tag. */
export type LoadTarget = {
  addEventListener(type: "load", listener: () => void): void;
};

/** The parts of a `<script>` element the loader sets. HTMLScriptElement fits. */
export type ScriptLike = LoadTarget & {
  src: string;
  async: boolean;
  crossOrigin: string | null;
  setAttribute(name: string, value: string): void;
};

/** The parts of `document` the loader uses; generic so the real Document fits as is. */
export type AnalyticsDocument<E extends ScriptLike> = {
  readonly head: { appendChild(node: E): unknown };
  createElement(tag: "script"): E;
  querySelector(selector: string): LoadTarget | null;
};

/** The parts of `window` the loader reads and writes. `databuddy` is set by databuddy.js. */
export type AnalyticsWindow = {
  databuddyDisabled?: boolean;
  readonly databuddy?: unknown;
  readonly doNotTrack?: unknown;
  readonly location: { readonly origin: string };
  addEventListener(type: "error" | "unhandledrejection", listener: (event: unknown) => void): void;
};

/** The opt-out properties some browsers add, which lib.dom does not declare. */
export type AnalyticsNavigator = {
  readonly globalPrivacyControl?: unknown;
  readonly doNotTrack?: unknown;
  readonly msDoNotTrack?: unknown;
};

export type AnalyticsEnv<E extends ScriptLike> = {
  /** Databuddy's client id; "" keeps everything off. */
  readonly clientId: string;
  /** `import.meta.env.PROD`. */
  readonly production: boolean;
  readonly window: AnalyticsWindow;
  readonly navigator: AnalyticsNavigator;
  readonly document: AnalyticsDocument<E>;
  /** Sends one request body to Databuddy's error intake; the default posts it with fetch. */
  readonly postErrors?: (url: string, body: string) => void;
  /** A new event id; the default is crypto.randomUUID. */
  readonly newId?: () => string;
};

export type Analytics = {
  /** Whether databuddy.js was added (or already present) on this page. */
  readonly enabled: boolean;
  trackEvent<N extends AnalyticsEventName>(name: N, properties: AnalyticsEvents[N]): void;
  reportError(error: unknown, context?: ErrorContext): void;
};

const DISABLED: Analytics = {
  enabled: false,
  trackEvent: () => undefined,
  reportError: () => undefined,
};

function browserView(env: AnalyticsEnv<ScriptLike>): BrowserView {
  return {
    origin: env.window.location.origin,
    globalPrivacyControl: env.navigator.globalPrivacyControl,
    doNotTrack: [env.navigator.doNotTrack, env.window.doNotTrack, env.navigator.msDoNotTrack],
  };
}

/** `window.databuddy.track`, once databuddy.js has defined it. */
function databuddyTrack(win: AnalyticsWindow) {
  const tracker = win.databuddy;
  if (typeof tracker !== "object" || tracker === null) return undefined;
  const method: unknown = Reflect.get(tracker, "track");
  return typeof method === "function"
    ? (name: string, properties: Record<string, string>): unknown =>
        Reflect.apply(method, tracker, [name, properties])
    : undefined;
}

/** `window.databuddy.getTrackingIds()`, so an error row joins the visitor's session. */
function trackingIds(win: AnalyticsWindow): {
  readonly anonId: string | null;
  readonly sessionId: string | null;
} {
  const tracker = win.databuddy;
  const none = { anonId: null, sessionId: null };
  if (typeof tracker !== "object" || tracker === null) return none;
  const method: unknown = Reflect.get(tracker, "getTrackingIds");
  if (typeof method !== "function") return none;
  const ids: unknown = Reflect.apply(method, tracker, []);
  if (typeof ids !== "object" || ids === null) return none;
  const anonId: unknown = Reflect.get(ids, "anonId");
  const sessionId: unknown = Reflect.get(ids, "sessionId");
  return {
    anonId: typeof anonId === "string" ? anonId : null,
    sessionId: typeof sessionId === "string" ? sessionId : null,
  };
}

function defaultPostErrors(url: string, body: string): void {
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body,
    keepalive: true,
    credentials: "omit",
  }).catch(() => undefined);
}

/** databuddy.js marks its own failed requests so they are not reported as app errors. */
const DATABUDDY_REQUEST_FAILURE = Symbol.for("databuddy.requestFailure");

/** Errors that say nothing about edit.here: other origins' scripts, extensions, browser noise. */
function isNoise(error: unknown, message: unknown): boolean {
  if (typeof error === "object" && error !== null && DATABUDDY_REQUEST_FAILURE in error) {
    return true;
  }
  const stack = error instanceof Error ? error.stack : undefined;
  if (typeof stack === "string" && /-extension:\/\//.test(stack)) return true;
  if (error == null && message === "Script error.") return true;
  return typeof message === "string" && message.startsWith("ResizeObserver loop");
}

/**
 * Adds databuddy.js when this page may report, at most once, and returns the event helpers.
 * Off the canonical origin or under an opt-out it sets `window.databuddyDisabled` and adds
 * nothing. Never throws: if reading the page does, analytics stays off.
 */
export function createAnalytics<E extends ScriptLike>(env: AnalyticsEnv<E>): Analytics {
  if (!env.production || env.clientId === "") return DISABLED;

  const win = env.window;
  try {
    if (!mayLoad(browserView(env))) {
      win.databuddyDisabled = true;
      return DISABLED;
    }

    const queue: (() => void)[] = [];
    const flush = () => {
      for (const send of queue.splice(0)) {
        try {
          send();
        } catch {
          // A tracker error never reaches the app.
        }
      }
    };

    const existing = env.document.querySelector(`script[${DATABUDDY_TAG_MARK}]`);
    if (existing === null) {
      const script = env.document.createElement("script");
      script.src = DATABUDDY_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.setAttribute(DATABUDDY_TAG_MARK, "");
      script.setAttribute("data-client-id", env.clientId);
      for (const [name, value] of Object.entries(DATABUDDY_SETTINGS)) {
        script.setAttribute(name, value);
      }
      // Offline, the download fails and no load event comes: queued events stay in memory and
      // every helper keeps being a silent no-op.
      script.addEventListener("load", flush);
      env.document.head.appendChild(script);
    } else {
      // Added by an earlier start and maybe still downloading: flush when it lands.
      existing.addEventListener("load", flush);
    }

    const sentOnce = new Set<string>();
    const postErrors = env.postErrors ?? defaultPostErrors;
    const newId = env.newId ?? (() => crypto.randomUUID());
    const errorsUrl = `${DATABUDDY_ERRORS_URL}?client_id=${encodeURIComponent(env.clientId)}`;

    /** Runs `run` now if databuddy.js is ready, else once it loads. */
    const whenReady = (run: () => void) => {
      if (databuddyTrack(win) !== undefined) {
        flush();
        run();
        return;
      }
      if (queue.length >= MAX_QUEUED) queue.shift();
      queue.push(run);
    };

    const send = (name: AnalyticsEventName, properties: unknown) => {
      const picked = pickEventProperties(name, properties);
      if (picked === null) return;
      if (ONCE_PER_PAGE.has(name)) {
        const key = JSON.stringify([name, picked]);
        if (sentOnce.has(key)) return;
        sentOnce.add(key);
      }
      whenReady(() => databuddyTrack(win)?.(name, picked));
    };

    /** Also files the error in Databuddy's error tracking, as a row built only from the codes. */
    const sendErrorSpan = (properties: AnalyticsEvents["js_error"]) => {
      const checked = pickEventProperties("js_error", properties);
      if (checked === null) return;
      const at = Date.now();
      whenReady(() => {
        const span = errorSpan(properties, trackingIds(win), newId(), at);
        postErrors(errorsUrl, JSON.stringify([span]));
      });
    };

    const reported = new Set<string>();
    const report = (error: unknown, context: ErrorContext = { source: "app" }) => {
      try {
        if (reported.size >= MAX_ERRORS_PER_PAGE) return;
        const properties = errorProperties(error, context);
        const key = `${properties.source}|${properties.name}|${properties.code}`;
        if (reported.has(key)) return;
        reported.add(key);
        send("js_error", properties);
        sendErrorSpan(properties);
      } catch {
        // A hostile or broken error object never escapes.
      }
    };

    // databuddy.js's own error capture is off (see top of file); report sanitized copies instead.
    win.addEventListener("error", (event) => {
      try {
        if (typeof event !== "object" || event === null) return;
        const error: unknown = Reflect.get(event, "error");
        const message: unknown = Reflect.get(event, "message");
        // Failed <script>/<img> loads fire `error` too, with no message; they are not app errors.
        if (error == null && typeof message !== "string") return;
        if (isNoise(error, message)) return;
        report(error ?? message, { source: "window" });
      } catch {
        // Never let reporting throw from a global handler.
      }
    });
    win.addEventListener("unhandledrejection", (event) => {
      try {
        if (typeof event !== "object" || event === null) return;
        const reason: unknown = Reflect.get(event, "reason");
        if (isNoise(reason, undefined)) return;
        report(reason, { source: "promise" });
      } catch {
        // Never let reporting throw from a global handler.
      }
    });

    return {
      enabled: true,
      trackEvent(name, properties) {
        try {
          send(name, properties);
        } catch {
          // Analytics never changes the page.
        }
      },
      reportError: report,
    };
  } catch {
    try {
      win.databuddyDisabled = true;
    } catch {
      // Nothing more to do.
    }
    return DISABLED;
  }
}

// --- the app's instance -------------------------------------------------------------------

/** Databuddy's client id, inlined at build time; "" on every build but production's. */
const CLIENT_ID: string = import.meta.env.VITE_DATABUDDY_CLIENT_ID?.trim() ?? "";

let instance: Analytics = DISABLED;
let started = false;

/** Whether this runs in a browser page (not SSR, a worker or Node). */
function hasBrowserGlobals(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof navigator !== "undefined"
  );
}

/** Starts analytics for this page. Call once, before rendering; later calls change nothing. */
export function initAnalytics<E extends ScriptLike>(env?: AnalyticsEnv<E>): Analytics {
  if (started) return instance;
  if (env === undefined) {
    if (!hasBrowserGlobals()) return DISABLED;
    started = true;
    instance = createAnalytics<HTMLScriptElement>({
      clientId: CLIENT_ID,
      production: import.meta.env.PROD,
      window,
      navigator,
      document,
    });
    return instance;
  }
  started = true;
  instance = createAnalytics(env);
  return instance;
}

/** Databuddy's client id for flag evaluation; "" off production. */
export const DATABUDDY_CLIENT_ID = CLIENT_ID;

/** Whether this page loaded databuddy.js; flags are only evaluated then. */
export function analyticsEnabled(): boolean {
  return instance.enabled;
}

/** Test hook: forgets the started instance. */
export function resetAnalyticsForTests(): void {
  instance = DISABLED;
  started = false;
}

/** Sends one product event. Never throws; a no-op when analytics is off. */
export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  properties: AnalyticsEvents[N],
): void {
  try {
    instance.trackEvent(name, properties);
  } catch {
    // Analytics never changes the page.
  }
}

/** Reports a caught error without file names, paths or contents. Never throws. */
export function reportError(error: unknown, context?: ErrorContext): void {
  try {
    instance.reportError(error, context);
  } catch {
    // Analytics never changes the page.
  }
}
