import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_ORIGIN,
  createAnalytics,
  DATABUDDY_SCRIPT_URL,
  DATABUDDY_TAG_MARK,
  initAnalytics,
  isEventName,
  mayLoad,
  normalizeExportFormat,
  optedOut,
  pickEventProperties,
  reportError,
  resetAnalyticsForTests,
  safeErrorName,
  classifyError,
  ERROR_CODES,
  trackEvent,
  type AnalyticsDocument,
  type AnalyticsEnv,
  type AnalyticsNavigator,
  type AnalyticsWindow,
  type ScriptLike,
} from "../src/lib/analytics";

/** A `<script>` element as the loader sees it, recording what was set. */
class FakeScript implements ScriptLike {
  src = "";
  async = false;
  crossOrigin: string | null = null;
  readonly attributes = new Map<string, string>();
  private readonly loadListeners: (() => void)[] = [];

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(_type: "load", listener: () => void): void {
    this.loadListeners.push(listener);
  }

  /** The browser finished downloading and running the script. */
  fireLoad(): void {
    for (const listener of this.loadListeners) listener();
  }
}

/** A document whose `<head>` collects appended scripts; `querySelector` finds the marked one. */
class FakeDocument implements AnalyticsDocument<FakeScript> {
  readonly appended: FakeScript[] = [];
  readonly head = { appendChild: (node: FakeScript) => this.appended.push(node) };

  createElement(_tag: "script"): FakeScript {
    return new FakeScript();
  }

  querySelector(selector: string): FakeScript | null {
    if (selector !== `script[${DATABUDDY_TAG_MARK}]`) return null;
    return this.appended.find((script) => script.attributes.has(DATABUDDY_TAG_MARK)) ?? null;
  }
}

/** A window that records its `error` / `unhandledrejection` listeners so tests can fire them. */
class FakeWindow implements AnalyticsWindow {
  databuddyDisabled?: boolean;
  databuddy?: unknown;
  doNotTrack?: unknown;
  readonly location: { origin: string };
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(origin: string) {
    this.location = { origin };
  }

  addEventListener(type: "error" | "unhandledrejection", listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: "error" | "unhandledrejection", event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, list) => sum + list.length, 0);
  }
}

type Call = { readonly name: unknown; readonly properties: unknown };

/** What databuddy.js puts on `window.databuddy`, recording `track` calls. */
function fakeTracker(options: { throws?: boolean } = {}) {
  const calls: Call[] = [];
  const tracker = {
    track: (name: unknown, properties: unknown) => {
      calls.push({ name, properties });
      if (options.throws === true) throw new Error("tracker exploded");
    },
  };
  return { tracker, calls };
}

function setup(
  overrides: {
    clientId?: string;
    production?: boolean;
    origin?: string;
    navigator?: AnalyticsNavigator;
    windowDoNotTrack?: unknown;
    document?: FakeDocument;
  } = {},
) {
  const document = overrides.document ?? new FakeDocument();
  const win = new FakeWindow(overrides.origin ?? CANONICAL_ORIGIN);
  if (overrides.windowDoNotTrack !== undefined) win.doNotTrack = overrides.windowDoNotTrack;
  const env: AnalyticsEnv<FakeScript> = {
    clientId: overrides.clientId ?? "client-123",
    production: overrides.production ?? true,
    window: win,
    navigator: overrides.navigator ?? {},
    document,
  };
  return { env, document, win };
}

/** An enabled instance whose tracker has already loaded. */
function loaded(options: { throws?: boolean } = {}) {
  const { env, win, document } = setup();
  const { tracker, calls } = fakeTracker(options);
  win.databuddy = tracker;
  return { analytics: createAnalytics(env), calls, win, document };
}

/** Every string inside what was sent, joined, for leak checks. */
function sentText(calls: readonly Call[]): string {
  return JSON.stringify(calls);
}

afterEach(() => {
  resetAnalyticsForTests();
});

describe("optedOut / mayLoad", () => {
  it("treats GPC true and DNT '1' or 'yes' anywhere as an opt-out", () => {
    const base = { origin: CANONICAL_ORIGIN, globalPrivacyControl: undefined, doNotTrack: [] };
    expect(optedOut(base)).toBe(false);
    expect(optedOut({ ...base, globalPrivacyControl: true })).toBe(true);
    expect(optedOut({ ...base, globalPrivacyControl: "true" })).toBe(false);
    expect(optedOut({ ...base, doNotTrack: [undefined, "1", undefined] })).toBe(true);
    expect(optedOut({ ...base, doNotTrack: [undefined, undefined, "yes"] })).toBe(true);
    expect(optedOut({ ...base, doNotTrack: ["0", "no", "unspecified"] })).toBe(false);
  });

  it("only loads at the canonical origin", () => {
    const view = { globalPrivacyControl: undefined, doNotTrack: [] };
    expect(mayLoad({ ...view, origin: "https://edit.here" })).toBe(true);
    for (const origin of [
      "http://edit.here",
      "https://www.edit.here",
      "http://localhost:5173",
      "http://127.0.0.1:4173",
      "http://evo-1.tail1234.ts.net:4173",
      "https://edit-here-git-main.vercel.app",
    ]) {
      expect(mayLoad({ ...view, origin })).toBe(false);
    }
  });
});

describe("createAnalytics: dormant cases", () => {
  it("stays dormant without a client id: no tag, no flag, no listeners, no calls", () => {
    const { env, document, win } = setup({ clientId: "" });
    const { tracker, calls } = fakeTracker();
    win.databuddy = tracker;
    const analytics = createAnalytics(env);
    analytics.trackEvent("image_copied", { kind: "image" });
    analytics.reportError(new Error("boom"));
    expect(analytics.enabled).toBe(false);
    expect(document.appended).toHaveLength(0);
    expect(win.databuddyDisabled).toBeUndefined();
    expect(win.listenerCount()).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("stays dormant on a dev build even at the canonical origin", () => {
    const { env, document } = setup({ production: false });
    expect(createAnalytics(env).enabled).toBe(false);
    expect(document.appended).toHaveLength(0);
  });

  it.each([
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://evo-1.tail1234.ts.net:4173",
    "https://edit-here-abc123.vercel.app",
  ])("sets databuddyDisabled and adds nothing at %s", (origin) => {
    const { env, document, win } = setup({ origin });
    const { tracker, calls } = fakeTracker();
    win.databuddy = tracker;
    const analytics = createAnalytics(env);
    analytics.trackEvent("editor_opened", { kind: "image", source: "file" });
    expect(analytics.enabled).toBe(false);
    expect(win.databuddyDisabled).toBe(true);
    expect(document.appended).toHaveLength(0);
    expect(win.listenerCount()).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["GPC", { navigator: { globalPrivacyControl: true } }],
    ["navigator.doNotTrack '1'", { navigator: { doNotTrack: "1" } }],
    ["navigator.doNotTrack 'yes'", { navigator: { doNotTrack: "yes" } }],
    ["window.doNotTrack '1'", { windowDoNotTrack: "1" }],
    ["navigator.msDoNotTrack '1'", { navigator: { msDoNotTrack: "1" } }],
  ] as const)("respects %s: databuddyDisabled, no tag", (_label, overrides) => {
    const { env, document, win } = setup(overrides);
    const analytics = createAnalytics(env);
    expect(analytics.enabled).toBe(false);
    expect(win.databuddyDisabled).toBe(true);
    expect(document.appended).toHaveLength(0);
  });

  it("stays off and never throws when reading the page throws", () => {
    const { env, document, win } = setup();
    const throwingEnv: AnalyticsEnv<FakeScript> = {
      ...env,
      navigator: {
        get globalPrivacyControl(): unknown {
          throw new Error("blocked");
        },
      },
    };
    const analytics = createAnalytics(throwingEnv);
    expect(analytics.enabled).toBe(false);
    expect(win.databuddyDisabled).toBe(true);
    expect(document.appended).toHaveLength(0);
  });

  it("initAnalytics() without globals (SSR, Node) returns a disabled instance and never throws", () => {
    expect(typeof window).toBe("undefined");
    expect(() => initAnalytics()).not.toThrow();
    expect(initAnalytics().enabled).toBe(false);
    expect(() => trackEvent("image_copied", { kind: "image" })).not.toThrow();
    expect(() => reportError(new Error("x"))).not.toThrow();
  });
});

describe("createAnalytics: canonical origin", () => {
  it("adds exactly one tag with interactions, attributes and raw error capture off", () => {
    const { env, document, win } = setup({ clientId: "client-123" });
    const analytics = createAnalytics(env);
    expect(analytics.enabled).toBe(true);
    expect(win.databuddyDisabled).toBeUndefined();
    expect(document.appended).toHaveLength(1);
    const [script] = document.appended;
    expect(script?.src).toBe(DATABUDDY_SCRIPT_URL);
    expect(script?.src).toBe("https://cdn.databuddy.cc/databuddy.js");
    expect(script?.async).toBe(true);
    expect(script?.crossOrigin).toBe("anonymous");
    expect(Object.fromEntries(script?.attributes ?? [])).toEqual({
      "data-edit-here-databuddy": "",
      "data-client-id": "client-123",
      "data-track-web-vitals": "true",
      "data-track-outgoing-links": "false",
      "data-track-interactions": "false",
      "data-track-attributes": "false",
      "data-track-errors": "false",
    });
  });

  it("is idempotent: a second start adds no second tag", () => {
    const { env, document } = setup();
    createAnalytics(env);
    createAnalytics(env);
    createAnalytics(env);
    expect(document.appended).toHaveLength(1);
  });

  it("initAnalytics starts once; later calls return the same instance", () => {
    const { env, document } = setup();
    const first = initAnalytics(env);
    const second = initAnalytics(setup().env);
    expect(second).toBe(first);
    expect(document.appended).toHaveLength(1);
  });

  it("flushes queued events when an existing, still-loading tag finishes", () => {
    const document = new FakeDocument();
    // A tag from an earlier start, still downloading.
    setup({ document }).env.document.head.appendChild(
      (() => {
        const script = new FakeScript();
        script.setAttribute(DATABUDDY_TAG_MARK, "");
        return script;
      })(),
    );
    const { env, win } = setup({ document });
    const analytics = createAnalytics(env);
    expect(document.appended).toHaveLength(1);
    analytics.trackEvent("editor_opened", { kind: "video", source: "restore" });
    const { tracker, calls } = fakeTracker();
    win.databuddy = tracker;
    document.appended[0]?.fireLoad();
    expect(calls).toEqual([
      { name: "editor_opened", properties: { kind: "video", source: "restore" } },
    ]);
  });
});

describe("trackEvent", () => {
  it("forwards to window.databuddy.track", () => {
    const { analytics, calls } = loaded();
    analytics.trackEvent("export_completed", { kind: "video", format: "mp4" });
    expect(calls).toEqual([
      { name: "export_completed", properties: { kind: "video", format: "mp4" } },
    ]);
  });

  it("strips properties the schema does not list, even when TypeScript lets them through", () => {
    const { analytics, calls } = loaded();
    // Not a fresh literal, so TypeScript's excess-property check does not apply.
    const props = { kind: "image", fileName: "jane private scan.png", bytes: [1, 2] } as const;
    analytics.trackEvent("image_copied", props);
    expect(calls).toEqual([{ name: "image_copied", properties: { kind: "image" } }]);
    expect(calls[0]?.properties).not.toBe(props);
    expect(sentText(calls)).not.toContain("jane");
  });

  it("drops event names that only exist on Object.prototype", () => {
    const { analytics, calls } = loaded();
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(isEventName(name)).toBe(false);
      // Forced past TypeScript, as a caller with a bad cast would.
      Reflect.apply(analytics.trackEvent, analytics, [name, { kind: "image" }]);
      Reflect.apply(trackEvent, undefined, [name, { kind: "image" }]);
      expect(pickEventProperties(name, {})).toBe(null);
    }
    expect(calls).toHaveLength(0);
    expect(isEventName("image_copied")).toBe(true);
  });

  it("normalizes export formats to a fixed list and drops everything else", () => {
    expect(normalizeExportFormat("image/png")).toBe("png");
    expect(normalizeExportFormat("image/jpeg")).toBe("jpeg");
    expect(normalizeExportFormat("image/webp")).toBe("webp");
    expect(normalizeExportFormat("video/mp4")).toBe("mp4");
    expect(normalizeExportFormat("video/webm")).toBe("webm");
    for (const format of ["png", "jpeg", "webp", "mp4", "webm"]) {
      expect(normalizeExportFormat(format)).toBe(format);
    }
    for (const bad of ["privatepatient", "jpg", "gif", "image/gif", "PNG", "", "__proto__", 1]) {
      expect(normalizeExportFormat(bad)).toBeUndefined();
    }
    const { analytics, calls } = loaded();
    const forced = { kind: "image", format: "privatepatient" };
    Reflect.apply(analytics.trackEvent, analytics, ["export_completed", forced]);
    analytics.trackEvent("export_completed", { kind: "image", format: "png" });
    expect(calls).toEqual([
      { name: "export_completed", properties: { kind: "image", format: "png" } },
    ]);
  });

  it("drops an event whose values are not allowed", () => {
    expect(pickEventProperties("export_completed", { kind: "image", format: "scan.png" })).toBe(
      null,
    );
    expect(pickEventProperties("export_completed", { kind: "audio", format: "png" })).toBe(null);
    expect(pickEventProperties("editor_opened", { kind: "image" })).toBe(null);
    expect(pickEventProperties("image_copied", null)).toBe(null);
    expect(pickEventProperties("star_prompt_shown", { placement: "home", extra: 1 })).toEqual({
      placement: "home",
    });
  });

  it("queues events until databuddy.js loads, then sends them in order", () => {
    const { env, win, document } = setup();
    const analytics = createAnalytics(env);
    analytics.trackEvent("editor_opened", { kind: "image", source: "restore" });
    analytics.trackEvent("star_prompt_shown", { placement: "image" });
    const { tracker, calls } = fakeTracker();
    win.databuddy = tracker;
    document.appended[0]?.fireLoad();
    expect(calls.map((call) => call.name)).toEqual(["editor_opened", "star_prompt_shown"]);
  });

  it("is a silent no-op offline: the script never loads and nothing throws", () => {
    const { env, win } = setup();
    const analytics = createAnalytics(env);
    expect(() => {
      for (let i = 0; i < 200; i += 1) analytics.trackEvent("image_copied", { kind: "image" });
      analytics.reportError(new Error("offline"));
    }).not.toThrow();
    expect(win.databuddy).toBeUndefined();
  });

  it("swallows a throwing tracker", () => {
    const { analytics, calls } = loaded({ throws: true });
    expect(() => analytics.trackEvent("image_copied", { kind: "image" })).not.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("ignores a window.databuddy that is not an object or lacks track", () => {
    const { env, win } = setup();
    const analytics = createAnalytics(env);
    win.databuddy = "nope";
    expect(() => analytics.trackEvent("image_copied", { kind: "image" })).not.toThrow();
    win.databuddy = { track: 42 };
    expect(() => analytics.trackEvent("image_copied", { kind: "image" })).not.toThrow();
  });

  it("module helpers are no-ops before initAnalytics and forward after", () => {
    const { env, win } = setup();
    const { tracker, calls } = fakeTracker();
    win.databuddy = tracker;
    trackEvent("image_copied", { kind: "image" });
    expect(calls).toHaveLength(0);
    initAnalytics(env);
    trackEvent("image_copied", { kind: "image" });
    expect(calls).toEqual([{ name: "image_copied", properties: { kind: "image" } }]);
  });
});

describe("reportError", () => {
  it("sends a js_error with a fixed code and no text from the message", () => {
    const { analytics, calls } = loaded();
    const error = new RangeError("Decoding /home/jane/Pictures/jane private scan.png failed");
    error.stack = `RangeError: ${error.message}\n    at decode (https://edit.here/assets/index-abc123.js:1:2345)`;
    analytics.reportError(error, { source: "export" });
    expect(calls).toEqual([
      {
        name: "js_error",
        properties: {
          source: "export",
          name: "RangeError",
          code: "decode_failed",
        },
      },
    ]);
    expect(sentText(calls)).not.toMatch(/jane|Pictures|scan|Decoding/);
  });

  it.each([
    ["comma inside a path", "Open failed: /Users/jane/a,RestrictedCohortJuliet/scan.customext"],
    [
      "parentheses inside a path",
      "Open failed (/Users/jane/(RestrictedCohortJuliet)/x (1).customext)",
    ],
    ["windows path", "Cannot read C:\\Users\\Jane Doe\\RestrictedCohortJuliet\\scan,v2.png"],
    ["unlisted extension", "RestrictedCohortJuliet.customext could not be decoded"],
    ["plain private words", "RestrictedCohortJuliet patient zero"],
    [
      "quotes and URLs",
      `'RestrictedCohortJuliet' at blob:https://edit.here/RestrictedCohortJuliet`,
    ],
    ["long text", "RestrictedCohortJuliet ".repeat(50)],
  ])("never sends any piece of the message: %s", (_label, message) => {
    const { analytics, calls } = loaded();
    for (const ErrorType of [Error, TypeError, RangeError]) {
      analytics.reportError(new ErrorType(message), { source: "window" });
    }
    analytics.reportError(message, { source: "promise" });
    const custom = new Error(message);
    custom.name = "RestrictedCohortJulietError";
    analytics.reportError(custom);
    expect(calls.length).toBeGreaterThan(0);
    const sent = sentText(calls);
    expect(sent).not.toContain("RestrictedCohortJuliet");
    expect(sent).not.toMatch(/jane|Users|customext|patient|scan/i);
    // Exactly three values, each from a fixed list.
    for (const call of calls) {
      const properties = call.properties;
      if (typeof properties !== "object" || properties === null) throw new Error("no properties");
      expect(Object.keys(properties).toSorted()).toEqual(["code", "name", "source"]);
      expect(ERROR_CODES).toContain(Reflect.get(properties, "code"));
    }
  });

  it("drops a js_error whose code is not on the list, even sent directly", () => {
    const { analytics, calls } = loaded();
    for (const code of [
      "Open failed: /Users/jane/a,RestrictedCohortJuliet",
      "decode_failed ",
      "",
      "toString",
    ]) {
      const forced = { source: "app", name: "Error", code };
      Reflect.apply(analytics.trackEvent, analytics, ["js_error", forced]);
      Reflect.apply(trackEvent, undefined, ["js_error", forced]);
    }
    const legacy = { source: "app", name: "Error", message: "RestrictedCohortJuliet" };
    Reflect.apply(analytics.trackEvent, analytics, ["js_error", legacy]);
    expect(calls).toHaveLength(0);
    analytics.trackEvent("js_error", { source: "app", name: "Error", code: "unknown" });
    expect(calls).toHaveLength(1);
  });

  it("replaces custom error names, which can carry private text", () => {
    const { analytics, calls } = loaded();
    const error = new Error("boom");
    error.name = "JanePrivateScanError";
    analytics.reportError(error);
    expect(calls[0]?.properties).toMatchObject({ source: "app", name: "Error" });
  });

  it("copes with non-Error throws", () => {
    const { analytics, calls } = loaded();
    analytics.reportError("could not read 'secret.mov'");
    analytics.reportError({ weird: true }, { source: "promise" });
    expect(calls.map((call) => call.properties)).toEqual([
      { source: "app", name: "Error", code: "unknown" },
      { source: "promise", name: "Error", code: "unknown" },
    ]);
    expect(sentText(calls)).not.toContain("secret");
  });

  it("never throws, even when reading the error's message or name throws", () => {
    const { analytics, calls } = loaded();
    const hostile = new Error("x");
    Object.defineProperty(hostile, "message", {
      get(): string {
        throw new Error("getter exploded");
      },
    });
    const hostileName = new Error("y");
    Object.defineProperty(hostileName, "name", {
      get(): string {
        throw new Error("getter exploded");
      },
    });
    expect(() => analytics.reportError(hostile)).not.toThrow();
    expect(() => analytics.reportError(hostileName)).not.toThrow();
    expect(() => reportError(hostile)).not.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("sends each distinct error once and at most 20 per page", () => {
    const { analytics, calls } = loaded();
    // Different messages, same source, name and code: one report.
    for (let i = 0; i < 3; i += 1) analytics.reportError(new Error(`same ${i}`));
    expect(calls).toHaveLength(1);
    // Every distinct (source, name, code) once, up to 20 per page.
    const names = [Error, TypeError, RangeError, ReferenceError, SyntaxError];
    const messages = ["Failed to fetch", "quota", "decode", "encode", "", "IndexedDB"];
    for (const ErrorType of names) {
      for (const message of messages) analytics.reportError(new ErrorType(message));
    }
    expect(calls).toHaveLength(20);
  });

  it("never throws when the tracker throws", () => {
    const { analytics } = loaded({ throws: true });
    expect(() => analytics.reportError(new Error("x"))).not.toThrow();
  });

  it("module reportError is a no-op while disabled", () => {
    const { env, win } = setup({ origin: "http://127.0.0.1:4173" });
    const { tracker, calls } = fakeTracker();
    win.databuddy = tracker;
    initAnalytics(env);
    reportError(new Error("boom"));
    expect(calls).toHaveLength(0);
  });
});

describe("global error listeners", () => {
  it("reports uncaught errors sanitized, as js_error from window", () => {
    const { win, calls } = loaded();
    const error = new TypeError(`Cannot read "C:\\Users\\Jane Doe\\scan.png"`);
    win.dispatch("error", { error, message: `Uncaught ${error.message}`, filename: "x" });
    expect(calls).toEqual([
      {
        name: "js_error",
        properties: {
          source: "window",
          name: "TypeError",
          code: "runtime_error",
        },
      },
    ]);
  });

  it("reports unhandled rejections sanitized, as js_error from promise", () => {
    const { win, calls } = loaded();
    win.dispatch("unhandledrejection", {
      reason: new TypeError("Failed to fetch blob:https://edit.here/0d1e-uuid for holiday.mp4"),
    });
    expect(calls[0]?.properties).toEqual({
      source: "promise",
      name: "TypeError",
      code: "network_error",
    });
  });

  it("skips cross-origin 'Script error.', resource load errors, extensions and databuddy's own failures", () => {
    const { win, calls } = loaded();
    win.dispatch("error", { error: null, message: "Script error." });
    win.dispatch("error", { error: null, message: undefined });
    const fromExtension = new Error("ext");
    fromExtension.stack = "Error: ext\n    at x (chrome-extension://abc/content.js:1:1)";
    win.dispatch("error", { error: fromExtension, message: "ext" });
    win.dispatch("error", { error: null, message: "ResizeObserver loop limit exceeded" });
    const failure = Object.assign(new Error("Failed to fetch"), {
      [Symbol.for("databuddy.requestFailure")]: true,
    });
    win.dispatch("unhandledrejection", { reason: failure });
    win.dispatch("error", null);
    expect(calls).toHaveLength(0);
  });
});

/** A DOMException with this name, as browsers throw them. */
function dom(name: string, message = "x"): DOMException {
  return new DOMException(message, name);
}

describe("classifyError", () => {
  it.each([
    [
      "chunk_load_failed",
      new TypeError(
        "Failed to fetch dynamically imported module: https://edit.here/assets/ImageEditor-x.js",
      ),
    ],
    ["chunk_load_failed", new TypeError("Importing a module script failed.")],
    ["quota_exceeded", dom("QuotaExceededError")],
    ["quota_exceeded", new Error("The quota has been exceeded.")],
    ["decode_failed", dom("InvalidStateError", "The source image could not be decoded.")],
    ["decode_failed", dom("EncodingError")],
    ["encode_failed", new Error("The browser could not encode the image.")],
    ["encode_failed", new Error("PNG encoding failed.")],
    ["clipboard_denied", dom("NotAllowedError", "Write permission denied.")],
    ["unsupported_media", new Error("Clipboard images are not supported.")],
    ["unsupported_media", dom("NotSupportedError")],
    ["unsupported_media", new Error("Unsupported codec avc1.64001f")],
    ["aborted", dom("AbortError", "Aborted")],
    ["network_error", new TypeError("Failed to fetch")],
    ["network_error", dom("NetworkError")],
    ["out_of_memory", new RangeError("Array buffer allocation failed")],
    ["out_of_memory", new Error("The browser could not allocate a canvas this large.")],
    ["storage_error", new Error("IndexedDB transaction failed")],
    ["storage_error", dom("VersionError")],
    ["runtime_error", new TypeError("Cannot read properties of undefined (reading 'x')")],
    ["runtime_error", new ReferenceError("foo is not defined")],
    ["unknown", new Error("Something odd")],
    ["unknown", "a string"],
    ["unknown", { weird: true }],
    ["unknown", null],
  ] as const)("%s", (code, error) => {
    expect(classifyError(error)).toBe(code);
  });

  it("calls an otherwise unexplained export failure encode_failed", () => {
    expect(classifyError(new Error("Something odd"), "export")).toBe("encode_failed");
    expect(classifyError(new Error("Something odd"), "window")).toBe("unknown");
  });
});

describe("safeErrorName", () => {
  it("keeps standard names only", () => {
    for (const name of ["TypeError", "DOMException", "QuotaExceededError", "NotAllowedError"]) {
      expect(safeErrorName(name)).toBe(name);
    }
    expect(safeErrorName("JaneScanError")).toBe("Error");
    expect(safeErrorName(undefined)).toBe("Error");
  });
});

describe("js_error carries no stack data", () => {
  it("sends exactly { source, name, code } even when the message fakes a bundle frame", () => {
    const { analytics, calls } = loaded();
    // V8 copies the message into the stack, so a frame-shaped message lands among the frames.
    const message = "x\n    at https://edit.here/assets/PrivateToken.js:1:1";
    const error = new TypeError(message);
    error.stack = `TypeError: ${message}\n    at f (https://edit.here/assets/index-abc123.js:9:9)`;
    analytics.reportError(error, { source: "window" });
    expect(calls).toEqual([
      {
        name: "js_error",
        properties: { source: "window", name: "TypeError", code: "runtime_error" },
      },
    ]);
    expect(sentText(calls)).not.toMatch(/PrivateToken|assets|index-abc123|edit\.here/);
  });

  it("strips a frame passed directly to trackEvent", () => {
    const { analytics, calls } = loaded();
    const withFrame = {
      source: "app",
      name: "Error",
      code: "unknown",
      frame: "/assets/PrivateToken.js:1:1",
    } as const;
    analytics.trackEvent("js_error", withFrame);
    expect(calls).toEqual([
      { name: "js_error", properties: { source: "app", name: "Error", code: "unknown" } },
    ]);
    expect(sentText(calls)).not.toContain("PrivateToken");
  });
});

describe("EditorErrorBoundary", () => {
  it("reports a caught render error, and a hostile error never escapes componentDidCatch", async () => {
    const { EditorErrorBoundary } = await import("../src/components/EditorErrorBoundary");
    const { env, win } = setup();
    const { tracker, calls } = fakeTracker();
    win.databuddy = tracker;
    initAnalytics(env);
    const boundary = new EditorErrorBoundary({ children: null, onClose: () => undefined });
    boundary.componentDidCatch(new Error("editor crashed"));
    expect(calls).toEqual([
      {
        name: "js_error",
        properties: { source: "editor", name: "Error", code: "unknown" },
      },
    ]);
    const hostile = new Error("x");
    Object.defineProperty(hostile, "message", {
      get(): string {
        throw new Error("getter exploded");
      },
    });
    expect(() => boundary.componentDidCatch(hostile)).not.toThrow();
  });
});
