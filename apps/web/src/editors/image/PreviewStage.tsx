import {
  DEFAULT_FRAME_CONFIG,
  dotGridSpacing,
  isFitViewport,
  resolveExportBackground,
  stageMaxZoom,
  type ExportBackground,
  type ImageDocumentState,
  type ImageLayout,
  type PixelRect,
} from "@edit-here/core";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../../components/Icon";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { HintButton } from "../../components/HintButton";
import type { Platform } from "../../lib/platform";
import {
  context2d,
  createCanvas,
  drawAnnotations,
  layoutForState,
  renderImageCanvas,
  type LayerSources,
} from "./render";
import { fitInside, useElementSize } from "./use-element-size";
import type { DecodedImage } from "./use-image-source";
import { useStageViewport, type StageViewportController } from "./use-stage-viewport";

type PreviewStageProps = {
  image: DecodedImage;
  state: ImageDocumentState;
  /** Preview-sized pictures for the image layers. */
  layers: LayerSources;
  /**
   * While a drag on the canvas is under way, the state it started from. The stage keeps the
   * scale and the base image's place from it, so a layer dragged past the edge grows the canvas
   * without the whole picture shrinking under the pointer.
   */
  fitState: ImageDocumentState | null;
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

/**
 * Live result, drawn from the downscaled preview bitmap. The `<canvas>` holds only the edited
 * composition (crop, redactions, drawings), cached apart from the frame. Background, padding,
 * radius, shadow and hairline are CSS around it, so frame sliders never resize or repaint the
 * canvas. The export and thumbnail draw the same frame with `compositeOutput`.
 */
export function PreviewStage({
  image,
  state,
  layers,
  fitState,
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
  const baseRadius = layout.baseRadius;
  const noFrameLayout = useMemo(
    () => ({
      ...layoutForState({
        sourceSize: image.size,
        state: { crop, rotation, flipX, annotations, frame: NO_FRAME },
        scale,
      }),
      baseRadius,
    }),
    [image.size, crop, rotation, flipX, annotations, scale, baseRadius],
  );
  const redactedCanvas = useMemo(
    () =>
      renderImageCanvas({
        source: image.preview,
        sourceSize: image.size,
        geometry: { crop, rotation, flipX },
        redactions,
        layout: noFrameLayout,
      }),
    [image, crop, rotation, flipX, redactions, noFrameLayout],
  );

  const imageCanvas = useMemo(() => {
    if (annotations.length === 0) return redactedCanvas;
    const copy = createCanvas(redactedCanvas.width, redactedCanvas.height);
    const ctx = context2d(copy);
    ctx.drawImage(redactedCanvas, 0, 0);
    drawAnnotations({
      ctx,
      canvas: copy,
      annotations,
      geometry: { crop, rotation, flipX },
      sourceSize: image.size,
      layout: noFrameLayout,
      layers,
      redactions,
    });
    return copy;
  }, [
    redactedCanvas,
    annotations,
    image.size,
    crop,
    rotation,
    flipX,
    noFrameLayout,
    layers,
    redactions,
  ]);

  const background = useMemo(
    () => resolveExportBackground({ frame, transparent, format: exportFormat }),
    [frame, transparent, exportFormat],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    if (canvas.width !== imageCanvas.width) canvas.width = imageCanvas.width;
    if (canvas.height !== imageCanvas.height) canvas.height = imageCanvas.height;
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageCanvas, 0, 0);
  }, [imageCanvas]);

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
 * zoomed or panned, so the fitted image stays uncluttered above the dock.
 */
function ZoomPill({
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
      <HintButton
        label="Zoom out"
        icon={<Icon icon={MinusSignIcon} className="size-4" />}
        onClick={controller.zoomOut}
        combo="-"
        platform={platform}
      />
      <HintButton
        label="Fit image to screen"
        icon={<span className="timecode min-w-[4ch] text-center text-xs text-ink">{value}%</span>}
        onClick={controller.fit}
        combo="Mod+0"
        platform={platform}
      />
      <HintButton
        label="Zoom in"
        icon={<Icon icon={PlusSignIcon} className="size-4" />}
        onClick={controller.zoomIn}
        combo="="
        platform={platform}
      />
      <HintButton
        label="Fit"
        showLabel
        icon={null}
        onClick={controller.fit}
        combo="Mod+0"
        platform={platform}
        disabled={atFit}
      />
    </div>
  );
}
