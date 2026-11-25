import type { ExportedFile } from "../editors/types";

/** The success toast for an export: the file that was downloaded, then the editor's note. */
export function exportDoneMessage({
  fileName,
  note,
}: Pick<ExportedFile, "fileName" | "note">): string {
  return note === null ? `Exported ${fileName}` : `Exported ${fileName}. ${note}`;
}
