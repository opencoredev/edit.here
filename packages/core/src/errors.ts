import { Data } from "effect";

/** The dropped or pasted file is not an image or video the editor can open. */
export class UnsupportedFileError extends Data.TaggedError("UnsupportedFileError")<{
  readonly fileName: string;
  readonly mimeType: string;
}> {
  override get message(): string {
    const label = this.mimeType === "" ? "unknown type" : this.mimeType;
    return `${this.fileName} (${label}) is not a supported image or video.`;
  }
}

/** Reading or decoding a supported file failed. */
export class FileLoadError extends Data.TaggedError("FileLoadError")<{
  readonly fileName: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `Could not load ${this.fileName}: ${this.reason}`;
  }
}

/** Rendering or encoding the edited output failed. */
export class ExportError extends Data.TaggedError("ExportError")<{
  readonly format: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `Export to ${this.format} failed: ${this.reason}`;
  }
}

/** An edit was requested that does not apply to the current document. */
export class InvalidOperationError extends Data.TaggedError("InvalidOperationError")<{
  readonly operation: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `${this.operation}: ${this.reason}`;
  }
}

export type EditorError =
  | UnsupportedFileError
  | FileLoadError
  | ExportError
  | InvalidOperationError;
