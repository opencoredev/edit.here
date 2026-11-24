import {
  cropFromCenter,
  cropToCenter,
  quarterTurns,
  rotationFromQuarterTurns,
  sameRect,
  type ImageGeometry,
} from "@edit-here/core";
import type { Cropper as CropperApi, CropValue } from "@zriz/react";
import * as Cropper from "@zriz/react/cropper";
import { useCallback, useEffect, useRef, useState } from "react";
import { aspectRatioOf, type AspectPreset } from "./aspect";

type CropStageProps = {
  file: File;
  geometry: ImageGeometry;
  aspect: AspectPreset;
  /** A crop gesture ended (drag, resize, keyboard, aspect change). */
  onCommit: (geometry: ImageGeometry) => void;
  /** Every frame of a gesture, for the live pixel readout. */
  onLive: (geometry: ImageGeometry | null) => void;
  onError: (message: string) => void;
};

const HANDLES = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
] as const;

function geometryFromValue(value: CropValue): ImageGeometry {
  return {
    crop: cropFromCenter(value),
    rotation: rotationFromQuarterTurns(value.quarterTurns),
    flipX: value.mirrored,
  };
}

function sameGeometry(a: ImageGeometry, b: ImageGeometry): boolean {
  return a.rotation === b.rotation && a.flipX === b.flipX && sameRect(a.crop, b.crop, 1e-5);
}

function valueFor(geometry: ImageGeometry): Partial<CropValue> {
  return {
    ...cropToCenter(geometry.crop),
    quarterTurns: quarterTurns(geometry.rotation),
    mirrored: geometry.flipX,
    rotation: 0,
  };
}

/**
 * The crop tool, built on zriz. The editor's history owns the crop; zriz reports gestures
 * through `onCommit`, and undo, redo, rotate and flip are pushed back in with `setValue`.
 */
export function CropStage({ file, geometry, aspect, onCommit, onLive, onError }: CropStageProps) {
  const cropperRef = useRef<CropperApi | null>(null);
  const [ready, setReady] = useState(false);
  // zriz reads defaultValue once; later changes go through setValue.
  const [initialValue] = useState(() => valueFor(geometry));

  useEffect(() => {
    const cropper = cropperRef.current;
    if (!ready || cropper === null) return;
    if (sameGeometry(geometryFromValue(cropper.getValue()), geometry)) return;
    cropper.setValue(valueFor(geometry), { emit: false, reason: "history" });
  }, [geometry, ready]);

  const handleCommit = useCallback(
    (value: CropValue) => {
      onLive(null);
      const next = geometryFromValue(value);
      if (!sameGeometry(next, geometry)) onCommit(next);
    },
    [geometry, onCommit, onLive],
  );

  return (
    <Cropper.Root
      src={file}
      actionsRef={cropperRef}
      defaultValue={initialValue}
      aspect={aspectRatioOf(aspect)}
      onLoad={() => setReady(true)}
      onError={(error) => onError(`Could not load the image for cropping (${error.code}).`)}
      onValueChange={(value) => onLive(geometryFromValue(value))}
      onValueCommit={handleCommit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Cropper.Viewport
        rotateGesture={false}
        className="relative min-h-0 flex-1 touch-none select-none"
        style={{ padding: "clamp(16px, 4vw, 40px)" }}
      >
        <Cropper.Image alt="" />
        <Cropper.Mask />
        <Cropper.Area aria-label="Crop area. Arrow keys move it, Alt and arrows resize it.">
          <Cropper.Grid />
          {HANDLES.map((position) => (
            <Cropper.Handle key={position} position={position} />
          ))}
        </Cropper.Area>
      </Cropper.Viewport>
    </Cropper.Root>
  );
}
