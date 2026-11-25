import { blobStops, gradientLine, type CanvasBackground, type ImageSize } from "@edit-here/core";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Paints a frame background over the whole canvas, the same way `canvasBackgroundCss` draws it. */
export function paintCanvasBackground(
  ctx: Ctx,
  background: CanvasBackground,
  size: ImageSize,
): void {
  switch (background.kind) {
    case "solid":
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, size.width, size.height);
      return;
    case "linear": {
      const line = gradientLine(background.angle, size);
      const gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
      for (const stop of background.stops) gradient.addColorStop(stop.offset, stop.color);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size.width, size.height);
      return;
    }
    case "mesh": {
      ctx.fillStyle = background.base;
      ctx.fillRect(0, 0, size.width, size.height);
      for (const blob of background.blobs) {
        const rx = blob.rx * size.width;
        const ry = blob.ry * size.height;
        if (rx <= 0 || ry <= 0) continue;
        // A unit circle scaled to the blob's radii is the CSS ellipse with percentage radii.
        ctx.save();
        ctx.translate(blob.x * size.width, blob.y * size.height);
        ctx.scale(rx, ry);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        for (const stop of blobStops(blob)) gradient.addColorStop(stop.offset, stop.color);
        ctx.fillStyle = gradient;
        ctx.fillRect(
          (-blob.x * size.width) / rx,
          (-blob.y * size.height) / ry,
          size.width / rx,
          size.height / ry,
        );
        ctx.restore();
      }
      return;
    }
    default: {
      const _exhaustive: never = background;
      return _exhaustive;
    }
  }
}
