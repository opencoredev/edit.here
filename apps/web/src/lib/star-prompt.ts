import { Option, Schema } from "effect";

/**
 * Asks returning visitors to star the repo. `localStorage` keeps the visit count and whether the
 * prompt was answered; a `sessionStorage` marker makes every reload in one tab count as a single
 * visit, so the prompt first shows on the second visit and never again once dismissed.
 */

/** `localStorage` key holding the visit count and dismissal; other tabs watch it too. */
export const STAR_PROMPT_KEY = "edit-here:star-prompt";

/** `sessionStorage` key marking that this tab's visit is already counted. */
export const VISIT_COUNTED_KEY = "edit-here:visit-counted";

const VisitStateSchema = Schema.Struct({
  visits: Schema.Finite,
  dismissed: Schema.Boolean,
});

export type VisitState = typeof VisitStateSchema.Type;

const EMPTY_STATE: VisitState = { visits: 0, dismissed: false };

/** The storage calls this module makes, so tests can hand in their own. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export type StarPromptStores = {
  readonly local: KeyValueStore;
  readonly session: KeyValueStore;
};

/** The browser's stores. Reading either can throw (blocked site data), so callers catch. */
function browserStores(): StarPromptStores {
  return { local: window.localStorage, session: window.sessionStorage };
}

const decodeVisitState = Schema.decodeUnknownOption(VisitStateSchema);

/** Reads the stored state; anything missing, malformed or out of range starts over. */
export function parseVisitState(raw: string | null): VisitState {
  if (raw === null) return EMPTY_STATE;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return EMPTY_STATE;
  }
  const decoded = decodeVisitState(json);
  if (Option.isNone(decoded)) return EMPTY_STATE;
  const { visits, dismissed } = decoded.value;
  return { visits: Math.max(0, Math.floor(visits)), dismissed };
}

function shouldShow(state: VisitState): boolean {
  return state.visits >= 2 && !state.dismissed;
}

/**
 * Counts this visit once per browser session and says whether to show the prompt. Calling it
 * again in the same session (a reload, or React StrictMode running effects twice) changes nothing
 * and gives the same answer. Returns `false` whenever storage throws: if a dismissal can't be
 * saved, the prompt would come back every visit.
 */
export function recordVisit(stores?: StarPromptStores): boolean {
  try {
    const { local, session } = stores ?? browserStores();
    const state = parseVisitState(local.getItem(STAR_PROMPT_KEY));
    if (session.getItem(VISIT_COUNTED_KEY) === "1") {
      // Confirm localStorage is still writable so we never show a prompt whose dismissal can't save.
      local.setItem(STAR_PROMPT_KEY, JSON.stringify(state));
      return shouldShow(state);
    }
    const next: VisitState = { visits: state.visits + 1, dismissed: state.dismissed };
    // Mark the session first so a failed session write never double-counts, and roll it back if
    // the localStorage write fails so a later reload doesn't treat the failed visit as counted.
    session.setItem(VISIT_COUNTED_KEY, "1");
    try {
      local.setItem(STAR_PROMPT_KEY, JSON.stringify(next));
    } catch (error) {
      try {
        session.setItem(VISIT_COUNTED_KEY, "");
      } catch {
        // Best effort rollback.
      }
      throw error;
    }
    return shouldShow(next);
  } catch {
    return false;
  }
}

/** Remembers that the prompt was answered (starred or dismissed), keeping the visit count. */
export function dismissStarPrompt(stores?: StarPromptStores): void {
  try {
    const { local } = stores ?? browserStores();
    const state = parseVisitState(local.getItem(STAR_PROMPT_KEY));
    const next: VisitState = { visits: state.visits, dismissed: true };
    local.setItem(STAR_PROMPT_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: recordVisit already returns false there, so the prompt stays hidden.
  }
}

/** Whether a `storage` event's new value (from another tab) means the prompt was answered. */
export function isDismissedValue(raw: string | null): boolean {
  return parseVisitState(raw).dismissed;
}
