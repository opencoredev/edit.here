import { useEffect, useState } from "react";

/**
 * An object URL for `blob` that is revoked when the blob changes or the component unmounts.
 * Created inside the effect (not `useMemo`) so StrictMode's mount/unmount/mount cycle never
 * leaves a revoked URL in use. Returns null until the first effect runs.
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (blob === null) {
      // oxlint-disable-next-line react/set-state-in-effect -- mirrors an external resource
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    // oxlint-disable-next-line react/set-state-in-effect -- the URL is an external resource owned by this effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
