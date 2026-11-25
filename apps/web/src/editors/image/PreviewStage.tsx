import {
  annotationListChange,
  baseImageShift,
  DEFAULT_FRAME_CONFIG,
  dotGridSpacing,
  imageLayoutsEqual,
  isFitViewport,
  resolveExportBackground,
  sameRect,
  stageMaxZoom,
  type AnnotationListChange,
  type ExportBackground,
  type ImageAnnotation,
  type ImageDocumentState,
  type ImageLayout,
  type PixelOffset,
  type PixelRect,
  type RedactionBox,
} from "@edit-here/core";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../../components/Icon";
import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { HintButton } from "../../components/HintButton";
import type { Platform } from "../../lib/platform";
import {
  context2d,
  createCanvas,
  createRedactedCanvasCache,
  drawAnnotations,
  layoutForState,
  NO_DRAFTS,
  redactionFootprints,
  type AnyCanvas,
  type LayerSources,
} from "./render";
import type { CanvasDraftStore } from "./canvas-draft";
import { createStagePainter, type StagePaint } from "./stage-paint";
import { subscribeTextFonts, textFontGeneration } from "./text-fonts";
import { fitInside, useElementSize } from "./use-element-size";
import type { DecodedImage } from "./use-image-source";
import { useStageViewport, type StageViewportController } from "./use-stage-viewport";

type PreviewStageProps = {
  image: DecodedImage;
  /** The document, or a control's live draft (a slider being dragged). */
  state: ImageDocumentState;
  /**
   * What a gesture on the canvas is drafting. While one is, the stage shows it and keeps the
   * scale and the base image's place from `state`, the state it started from, so a layer
   * dragged past the edge grows the canvas without the whole picture shrinking under the pointer.
   */
  canvasDraft: CanvasDraftStore;
  /**
   * The saved document's redaction boxes. A box that is new or placed elsewhere in `state` is
   * being drawn, moved or resized; a strength or style draft keeps its place.
   */
  savedRedactions: readonly RedactionBox[];
  /** Preview-sized pictures for the image layers. */
  layers: LayerSources;
  label: string;
  /** Rendered over the base image (not the frame padding), sized to it. */
  overlay?: ReactNode;
  platform: Platform;
  /** Filled with the stage's zoom commands while it is mounted. */
  controllerRef: RefObject<StageViewportController | null>;
};

const NO_FRAME = { ...DEFAULT_FRAME_CONFIG, enabled: false };

/** Matches `MATTE` in `render.ts`: formats without alpha export on white. */
const MATTE_CSS = "#ffffff";
/** Matches the hairline stroke in `compositeOutput`. */
const HAIRLINE_COLOR = "rgba(255, 255, 255, 0.14)";

function percent(part: number, whole: number): string {
  return `${(part / whole) * 100}%`;
}

/** `rect` (output pixels) as percentages of the output, for children of the stage content box. */
function placeRect(rect: PixelRect, output: ImageLayout["output"]): CSSProperties {
  return {
    left: percent(rect.x, output.width),
    top: percent(rect.y, output.height),
    width: percent(rect.width, output.width),
    height: percent(rect.height, output.height),
  };
}

function backgroundStyle(background: ExportBackground): CSSProperties | undefined {
  switch (background.kind) {
    case "transparent":
      return undefined;
    case "matte":
      return { background: MATTE_CSS };
    case "frame":
      return { background: background.css };
    default: {
      const _exhaustive: never = background;
      return _exhaustive;
    }
  }
}

/**
 * The frame shadow as CSS, matching `compositeOutput`. Like the canvas, each casting shape sits
 * off to the left (clipped away by the frame) and throws only its shadow back into place, so the
 * shadow also shows under see-through image pixels. Both layers are plain black at some alpha,
 * so painting them per shape lands on the same pixels as the canvas's layer-by-layer order.
 */
function FrameShadowShapes({ layout, k }: { layout: ImageLayout; k: number }) {
  const { shadow } = layout;
  if (shadow === null) return null;
  const layers = [shadow.contact, shadow.ambient];
  const away = Math.ceil(
    layout.output.width * k + Math.max(...layers.map((l) => l.blur)) * k * 4 + 10,
  );
  const boxShadow = layers
    .map((l) => `${away}px ${l.offsetY * k}px ${l.blur * k}px rgba(0, 0, 0, ${l.opacity})`)
    .join(", ");
  return layout.shadowShapes.map((shape, index) => (
    <div
      // The shapes are positional: the base image and each layer, in a fixed order.
      key={index}
      aria-hidden="true"
      className="absolute"
      style={{
        left: shape.rect.x * k - away,
        top: shape.rect.y * k,
        width: shape.rect.width * k,
        height: shape.rect.height * k,
        borderRadius: shape.radius * k,
        boxShadow,
      }}
    />
  ));
}

const NO_ANNOTATIONS: readonly ImageAnnotation[] = [];
const OTHER_CHANGE: AnnotationListChange = { kind: "other" };
const NO_SHIFT: PixelOffset = { x: 0, y: 0 };

/** A cached composition and the `textFontGeneration()` its text was drawn against. */
type TextRaster = { readonly canvas: AnyCanvas; readonly fonts: number };

/**
 * Live result, drawn from the downscaled preview bitmap. The `<canvas>` holds only the edited
 * composition (crop, redactions, drawings), cached apart from the frame. Background, padding,
 * radius, shadow and hairline are CSS around it, so frame sliders never resize or repaint the
 * canvas. The export and thumbnail draw the same frame with `compositeOutput`.
 */
export function PreviewStage({
  image,
  state: committed,
  canvasDraft,
  savedRedactions,
  layers,
  label,
  overlay,
  platform,
  controllerRef,
}: PreviewStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useElementSize(boxRef);
  const drafted = useSyncExternalStore(canvasDraft.subscribe, canvasDraft.get);
  const state = drafted ?? committed;
  const fitState = drafted === null ? null : committed;

  const scale = image.preview.width / image.size.width;
  const { crop, rotation, flipX, redactions, annotations, frame, transparent, exportFormat } =
    state;

  const layout = useMemo(
    () =>
      layoutForState({
        sourceSize: image.size,
        state: { crop, rotation, flipX, annotations, frame },
        scale,
      }),
    [image.size, crop, rotation, flipX, annotations, frame, scale],
  );
  const fitLayout = useMemo(
    () =>
      fitState === null
        ? layout
        : layoutForState({ sourceSize: image.size, state: fitState, scale }),
    [fitState, layout, image.size, scale],
  );

  // The composition with no layers: just the base image in its frame, which layers grow around.
  const baseLayout = useMemo(
    () =>
      layoutForState({
        sourceSize: image.size,
        state: { crop, rotation, flipX, annotations: [], frame },
        scale,
      }),
    [image.size, crop, rotation, flipX, frame, scale],
  );

  // The base image and its redactions are cached on their own; drawings repaint on a copy, so
  // a pen stroke never re-runs the blur and pixelate passes. The cache layout leaves out the
  // frame (padding and shadow live in the composite) but keeps the frame's corner radius on the
  // base image, which an expanded composition rounds inside the canvas exactly as the export does.
  // During a drag the cache layout comes from the state the drag started from, and the live one
  // is used only when the drag really changes it (a layer grown past the edge). Moving a drawing
  // then keeps the cached base image instead of redrawing it on every pointer move.
  const committedAnnotations = (fitState ?? state).annotations;
  const committedBaseRadius = fitLayout.baseRadius;
  const committedNoFrameLayout = useMemo(
    () => ({
      ...layoutForState({
        sourceSize: image.size,
        state: { crop, rotation, flipX, annotations: committedAnnotations, frame: NO_FRAME },
        scale,
      }),
      baseRadius: committedBaseRadius,
    }),
    [image.size, crop, rotation, flipX, committedAnnotations, scale, committedBaseRadius],
  );
  const baseRadius = layout.baseRadius;
  const liveNoFrameLayout = useMemo(
    () =>
      annotations === committedAnnotations && baseRadius === committedBaseRadius
        ? committedNoFrameLayout
        : {
            ...layoutForState({
              sourceSize: image.size,
              state: { crop, rotation, flipX, annotations, frame: NO_FRAME },
              scale,
            }),
            baseRadius,
          },
    [
      annotations,
      committedAnnotations,
      baseRadius,
      committedBaseRadius,
      committedNoFrameLayout,
      image.size,
      crop,
      rotation,
      flipX,
      scale,
    ],
  );
  const sameLayout = imageLayoutsEqual(liveNoFrameLayout, committedNoFrameLayout);
  // A layer dragged past the edge grows the composition around the base image without changing
  // how the base image is drawn: the cache stays in the drag's starting layout and is painted
  // shifted, instead of re-rendering the base image on every move. Blur and pixelate sample
  // with smoothing that can land a level apart once moved, so with those the cache is redrawn.
  const baseShift = sameLayout
    ? NO_SHIFT
    : redactions.every((redaction) => redaction.style === "blackout")
      ? baseImageShift(committedNoFrameLayout, liveNoFrameLayout)
      : null;
  const paintLayout = sameLayout ? committedNoFrameLayout : liveNoFrameLayout;
  const noFrameLayout = baseShift === null ? liveNoFrameLayout : committedNoFrameLayout;
  // A box being drawn, moved or resized skips the blur's costly soften pass until the pointer
  // lifts, when the committed state redacts it exactly. Exports never see a draft.
  const drafts = useMemo((): ReadonlySet<string> => {
    if (redactions === savedRedactions) return NO_DRAFTS;
    const before = new Map(savedRedactions.map((r) => [r.id, r.rect]));
    const moved = redactions
      .filter((r) => {
        const saved = before.get(r.id);
        return saved === undefined || !sameRect(saved, r.rect);
      })
      .map((r) => r.id);
    return moved.length === 0 ? NO_DRAFTS : new Set(moved);
  }, [redactions, savedRedactions]);
  // Repaints only what a redaction change reaches; a new canvas object means new pixels.
  const [redactionCache] = useState(createRedactedCanvasCache);
  const redactedCanvas = useMemo(
    () =>
      redactionCache.render({
        source: image.preview,
        sourceSize: image.size,
        geometry: { crop, rotation, flipX },
        redactions,
        layout: noFrameLayout,
        drafts,
      }),
    [redactionCache, image, crop, rotation, flipX, redactions, noFrameLayout, drafts],
  );
  // React may run a render and throw it away; the cache must not draw over what is on screen,
  // which this memo hands back as is whenever its inputs come back.
  useLayoutEffect(() => {
    redactionCache.retain(redactedCanvas);
  }, [redactionCache, redactedCanvas]);

  const geometry = useMemo(() => ({ crop, rotation, flipX }), [crop, rotation, flipX]);
  // What the stage painter compares to copy only the pixels a box change reaches.
  const redactionBoxes = useMemo(
    () =>
      redactionFootprints({
        redactions,
        geometry,
        layout: noFrameLayout,
        sourceSize: image.size,
        drafts,
      }),
    [redactions, geometry, noFrameLayout, image.size, drafts],
  );
  // Text drawn before the text font loaded used a fallback, so a load redraws the cached
  // drawings below, each tagged with the generation it was drawn against, and the painter
  // repaints in full for a paint of a new generation.
  const textFonts = useSyncExternalStore(subscribeTextFonts, textFontGeneration);
  // A drag that grows the composition (a layer past the edge) changes the layout; everything is
  // then redrawn over the base image on each move.
  const layoutChanged = paintLayout !== committedNoFrameLayout;

  // The composition the drag started from: base image, redactions and the committed drawings.
  // Outside a drag it is simply what is on screen.
  const committedImage = useMemo((): TextRaster => {
    if (layoutChanged || committedAnnotations.length === 0) {
      return { canvas: redactedCanvas, fonts: textFonts };
    }
    const copy = createCanvas(redactedCanvas.width, redactedCanvas.height);
    const ctx = context2d(copy);
    ctx.drawImage(redactedCanvas, 0, 0);
    drawAnnotations({
      ctx,
      canvas: copy,
      annotations: committedAnnotations,
      geometry,
      sourceSize: image.size,
      layout: noFrameLayout,
      layers,
      redactions,
    });
    return { canvas: copy, fonts: textFonts };
  }, [
    layoutChanged,
    textFonts,
    redactedCanvas,
    committedAnnotations,
    geometry,
    image.size,
    noFrameLayout,
    layers,
    redactions,
  ]);

  const change = useMemo(
    () => (layoutChanged ? OTHER_CHANGE : annotationListChange(committedAnnotations, annotations)),
    [layoutChanged, committedAnnotations, annotations],
  );
  const replacedIndex = change.kind === "replaced" ? change.index : null;
  // While one drawing or picture is dragged, everything under it is cached once, and each move
  // paints only it and what lies above it.
  const underReplaced = useMemo((): TextRaster | null => {
    if (replacedIndex === null) return null;
    if (replacedIndex === 0) return { canvas: redactedCanvas, fonts: textFonts };
    const copy = createCanvas(redactedCanvas.width, redactedCanvas.height);
    const ctx = context2d(copy);
    ctx.drawImage(redactedCanvas, 0, 0);
    drawAnnotations({
      ctx,
      canvas: copy,
      annotations: committedAnnotations.slice(0, replacedIndex),
      geometry,
      sourceSize: image.size,
      layout: noFrameLayout,
      layers,
      redactions,
    });
    return { canvas: copy, fonts: textFonts };
  }, [
    replacedIndex,
    textFonts,
    redactedCanvas,
    committedAnnotations,
    geometry,
    image.size,
    noFrameLayout,
    layers,
    redactions,
  ]);
  const paint: StagePaint = (() => {
    const shared = {
      shows: annotations,
      underAt: NO_SHIFT,
      layout: paintLayout,
      geometry,
      sourceSize: image.size,
      layers,
      redactions,
      redactionBoxes,
      fonts: textFonts,
    };
    switch (change.kind) {
      case "same":
        return {
          ...shared,
          under: committedImage.canvas,
          fonts: committedImage.fonts,
          extras: NO_ANNOTATIONS,
        };
      case "appended":
        return {
          ...shared,
          under: committedImage.canvas,
          fonts: committedImage.fonts,
          extras: annotations.slice(change.index),
        };
      case "replaced":
        return underReplaced === null
          ? { ...shared, under: redactedCanvas, extras: annotations }
          : {
              ...shared,
              under: underReplaced.canvas,
              fonts: underReplaced.fonts,
              extras: annotations.slice(change.index),
            };
      case "other":
        return {
          ...shared,
          under: redactedCanvas,
          underAt: baseShift ?? NO_SHIFT,
          extras: annotations,
        };
      default: {
        const _exhaustive: never = change;
        return _exhaustive;
      }
    }
  })();

  const background = useMemo(
    () => resolveExportBackground({ frame, transparent, format: exportFormat }),
    [frame, transparent, exportFormat],
  );

  // The display canvas keeps what it last painted, so a drag repaints only where it moved.
  const [painter] = useState(createStagePainter);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas !== null) painter.paint(canvas, paint);
  });

  // Screen pixels per output pixel, taken from the fit layout so a drag never rescales.
  const fitDisplay = fitInside(fitLayout.output, box);
  const k = fitLayout.output.width > 0 ? fitDisplay.width / fitLayout.output.width : 0;
  const display = { width: layout.output.width * k, height: layout.output.height * k };
  // The base image's own fit, without the layers that grow the composition around it. Raising
  // the zoom ceiling by `baseFitK / k` keeps the image's top magnification the same however far
  // the composition grows, so the release below never has its zoom clipped.
  const baseOutput = baseLayout.output;
  const baseFitK = baseOutput.width > 0 ? fitInside(baseOutput, box).width / baseOutput.width : k;
  const maxZoom = stageMaxZoom({ baseFitK, fitK: k });
  // Keeps the base image where the fit layout put it while the composition grows around it.
  const shift = {
    x: (display.width - fitDisplay.width) / 2 + (fitLayout.image.x - layout.image.x) * k,
    y: (display.height - fitDisplay.height) / 2 + (fitLayout.image.y - layout.image.y) * k,
  };
  const imageRect: PixelRect = layout.image;
  // The output canvas in image pixels, for 100% zoom and the zoom readout.
  const pixels = useMemo(
    () => ({ width: fitLayout.output.width / scale, height: fitLayout.output.height / scale }),
    [fitLayout.output.width, fitLayout.output.height, scale],
  );
  const fitted = useMemo(
    () => ({ width: fitDisplay.width, height: fitDisplay.height }),
    [fitDisplay.width, fitDisplay.height],
  );
  const { viewport, controller, spaceHeld, dragging, handlers } = useStageViewport({
    rootRef,
    contentRef,
    content: fitted,
    stage: box,
    pixels,
    maxZoom,
  });
  // Releasing a drag that grew the composition drops the held fit, which would refit the stage
  // and move everything under a still pointer. Re-express the old screen mapping in the new
  // layout instead: same scale, same place for every output pixel. A screen point is
  // `zoom * (p * k + origin) + pan` for an output point `p`, with `origin` the canvas's unzoomed
  // top-left from the stage center.
  const mapping = useRef<{
    readonly held: boolean;
    readonly k: number;
    readonly origin: { readonly x: number; readonly y: number };
    readonly viewport: typeof viewport;
  } | null>(null);
  useLayoutEffect(() => {
    const previous = mapping.current;
    const origin = { x: shift.x - display.width / 2, y: shift.y - display.height / 2 };
    mapping.current = { held: fitState !== null, k, origin, viewport };
    if (previous === null || !previous.held || fitState !== null) return;
    if (previous.k <= 0 || k <= 0) return;
    const moved =
      previous.k !== k || previous.origin.x !== origin.x || previous.origin.y !== origin.y;
    if (!moved) return;
    const before = previous.viewport;
    const zoom = (before.zoom * previous.k) / k;
    controller.setViewport({
      zoom,
      x: before.x + before.zoom * previous.origin.x - zoom * origin.x,
      y: before.y + before.zoom * previous.origin.y - zoom * origin.y,
    });
  });

  useLayoutEffect(() => {
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
    };
  }, [controller, controllerRef]);

  const percent100 =
    pixels.width > 0 ? Math.round(((viewport.zoom * fitDisplay.width) / pixels.width) * 100) : 100;
  const atFit = isFitViewport(viewport);
  const shifted = shift.x !== 0 || shift.y !== 0;
  // `--stage-zoom` lets overlays keep handles and outlines at a constant on-screen size.
  const contentStyle: CSSProperties & Record<"--stage-zoom", number> = {
    width: display.width,
    height: display.height,
    left: shifted ? shift.x : undefined,
    top: shifted ? shift.y : undefined,
    transform: atFit
      ? undefined
      : `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
    // Zoom about where the fitted composition's center is, which a growing drag moves off center.
    transformOrigin: shifted
      ? `${display.width / 2 - shift.x}px ${display.height / 2 - shift.y}px`
      : "center center",
    willChange: dragging ? "transform" : undefined,
    "--stage-zoom": viewport.zoom,
  };
  // A drafting dot grid behind the canvas that pans and zooms with it.
  const spacing = dotGridSpacing(viewport.zoom);
  const gridStyle: CSSProperties = {
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `calc(50% + ${viewport.x}px) calc(50% + ${viewport.y}px)`,
  };

  return (
    <div ref={rootRef} className="relative flex min-h-0 flex-1 touch-none flex-col" {...handlers}>
      <div
        ref={boxRef}
        style={gridStyle}
        className="stage-grid flex min-h-0 flex-1 items-center justify-center px-2 pt-[calc(var(--dock-top)+8px)] pb-[calc(var(--dock-bottom)+8px)] sm:px-8 sm:pt-[calc(var(--dock-top)+4px)] sm:pb-8"
      >
        <div ref={contentRef} className="relative shrink-0" style={contentStyle}>
          {/* The output frame. It clips the shadow at the output edge, as the export canvas does;
              the overlay stays outside it so handles on the image edge are not cut off. */}
          <div
            className={`absolute inset-0 overflow-hidden ${background.kind === "transparent" ? "checkerboard" : ""}`}
            style={backgroundStyle(background)}
          >
            <FrameShadowShapes layout={layout} k={k} />
            <div
              className="absolute overflow-hidden"
              style={{
                ...placeRect(layout.content, layout.output),
                borderRadius: layout.radius * k,
              }}
            >
              <canvas ref={canvasRef} role="img" aria-label={label} className="block size-full" />
            </div>
            {layout.hairline > 0 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  ...placeRect(layout.content, layout.output),
                  borderRadius: layout.radius * k,
                  boxShadow: `inset 0 0 0 ${layout.hairline * k}px ${HAIRLINE_COLOR}`,
                }}
              />
            ) : null}
          </div>
          {overlay === undefined ? null : (
            <div
              data-stage-overlay=""
              className="absolute"
              style={placeRect(imageRect, layout.output)}
            >
              {overlay}
            </div>
          )}
        </div>
      </div>
      {spaceHeld || dragging ? (
        // Hand tool: covers the overlays so their cursors and hovers stay out of the way.
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
        />
      ) : null}
      <ZoomPill percent={percent100} atFit={atFit} platform={platform} controller={controller} />
    </div>
  );
}

/**
 * Zoom readout and controls. Desktop: always in the bottom-right corner. Phones: only while
 * zoomed or panned, so the fitted image stays uncluttered above the dock. Memoized, and so are
 * its buttons that never show the zoom: the stage re-renders on every move of a drag, and a
 * frame slider changes the readout on each one.
 */
const ZoomPill = memo(function ZoomPill({
  percent: value,
  atFit,
  platform,
  controller,
}: {
  percent: number;
  atFit: boolean;
  platform: Platform;
  controller: StageViewportController;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Zoom"
      className={[
        "dock-surface absolute right-2 bottom-[calc(var(--dock-bottom)+8px)] z-20 flex items-center gap-0.5 rounded-md p-0.5 sm:right-3 sm:bottom-3",
        atFit ? "max-sm:hidden" : "",
      ].join(" ")}
    >
      <ZoomStepButton direction="out" platform={platform} controller={controller} />
      <HintButton
        label="Fit image to screen"
        icon={<span className="timecode min-w-[4ch] text-center text-xs text-ink">{value}%</span>}
        onClick={controller.fit}
        combo="Mod+0"
        platform={platform}
      />
      <ZoomStepButton direction="in" platform={platform} controller={controller} />
      <FitButton atFit={atFit} platform={platform} controller={controller} />
    </div>
  );
});

const ZoomStepButton = memo(function ZoomStepButton({
  direction,
  platform,
  controller,
}: {
  direction: "in" | "out";
  platform: Platform;
  controller: StageViewportController;
}) {
  return direction === "in" ? (
    <HintButton
      label="Zoom in"
      icon={<Icon icon={PlusSignIcon} className="size-4" />}
      onClick={controller.zoomIn}
      combo="="
      platform={platform}
    />
  ) : (
    <HintButton
      label="Zoom out"
      icon={<Icon icon={MinusSignIcon} className="size-4" />}
      onClick={controller.zoomOut}
      combo="-"
      platform={platform}
    />
  );
});

const FitButton = memo(function FitButton({
  atFit,
  platform,
  controller,
}: {
  atFit: boolean;
  platform: Platform;
  controller: StageViewportController;
}) {
  return (
    <HintButton
      label="Fit"
      showLabel
      icon={null}
      onClick={controller.fit}
      combo="Mod+0"
      platform={platform}
      disabled={atFit}
    />
  );
});
