import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  ReactNode,
} from "react";
import {
  ALL_STEPS,
  CHECKLIST_STEPS,
  ESSENTIAL_STEPS,
  TOTAL_STEPS,
  TOUR_STORAGE_KEY,
  TOUR_VERSION,
  TOUR_VERSION_KEY,
  TourGoal,
} from "@/components/tour/tour-config";

export type TourPhase =
  | "dormant"
  | "welcome"
  | "essentials"
  | "checklist"
  | "finished";

export interface TourState {
  phase: TourPhase;
  essentialIdx: number;
  activeChecklistId: string | null;
  completed: string[]; // serialisable; we treat it as a set in the reducer
  goal: TourGoal | null;
  railDismissed: boolean;
}

type Action =
  | { type: "hydrate"; payload: Partial<TourState> }
  | { type: "start" }
  | { type: "setGoal"; goal: TourGoal }
  | { type: "startEssentials" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "skipStep" }
  | { type: "skipAll" }
  | { type: "openChecklist"; id: string }
  | { type: "dismissActive" }
  | { type: "toggleRail" }
  | { type: "finish" }
  | { type: "restart" };

const initial: TourState = {
  phase: "dormant",
  essentialIdx: 0,
  activeChecklistId: null,
  completed: [],
  goal: null,
  railDismissed: false,
};

function complete(state: TourState, id: string): string[] {
  return state.completed.includes(id) ? state.completed : [...state.completed, id];
}

function reducer(state: TourState, action: Action): TourState {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.payload };
    case "start":
      return { ...initial, phase: "welcome", completed: state.completed, goal: state.goal };
    case "setGoal":
      return { ...state, goal: action.goal };
    case "startEssentials":
      return { ...state, phase: "essentials", essentialIdx: 0 };
    case "next": {
      if (state.phase === "essentials") {
        const cur = ESSENTIAL_STEPS[state.essentialIdx];
        const completed = cur ? complete(state, cur.id) : state.completed;
        const nextIdx = state.essentialIdx + 1;
        if (nextIdx >= ESSENTIAL_STEPS.length) {
          return { ...state, completed, phase: "checklist", essentialIdx: 0, railDismissed: false };
        }
        return { ...state, completed, essentialIdx: nextIdx };
      }
      return state;
    }
    case "prev":
      if (state.phase === "essentials" && state.essentialIdx > 0) {
        return { ...state, essentialIdx: state.essentialIdx - 1 };
      }
      return state;
    case "skipStep":
      if (state.phase === "essentials") {
        const nextIdx = state.essentialIdx + 1;
        if (nextIdx >= ESSENTIAL_STEPS.length) {
          return { ...state, phase: "checklist", essentialIdx: 0, railDismissed: false };
        }
        return { ...state, essentialIdx: nextIdx };
      }
      if (state.phase === "checklist" && state.activeChecklistId) {
        return { ...state, activeChecklistId: null };
      }
      return state;
    case "skipAll":
      return { ...state, phase: "dormant", activeChecklistId: null };
    case "openChecklist":
      return { ...state, phase: "checklist", activeChecklistId: action.id, railDismissed: false };
    case "dismissActive": {
      const id = state.activeChecklistId;
      if (!id) return state;
      const completed = complete(state, id);
      const isDone = completed.length >= TOTAL_STEPS;
      return {
        ...state,
        completed,
        activeChecklistId: null,
        phase: isDone ? "finished" : state.phase,
      };
    }
    case "toggleRail":
      return { ...state, railDismissed: !state.railDismissed };
    case "finish":
      return { ...state, phase: "finished", activeChecklistId: null };
    case "restart":
      return { ...initial, phase: "welcome" };
    default:
      return state;
  }
}

export interface TourApi {
  state: TourState;
  totalSteps: number;
  start: () => void;
  startEssentials: () => void;
  next: () => void;
  prev: () => void;
  skipStep: () => void;
  skipAll: () => void;
  openChecklist: (id: string) => void;
  dismissActive: () => void;
  toggleRail: () => void;
  setGoal: (g: TourGoal) => void;
  restart: () => void;
  finish: () => void;
}

const TourContext = createContext<TourApi | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hydrated = useRef(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOUR_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TourState>;
        dispatch({ type: "hydrate", payload: parsed });
      }
      const ver = Number(localStorage.getItem(TOUR_VERSION_KEY) || "0");
      if (ver < TOUR_VERSION) {
        localStorage.setItem(TOUR_VERSION_KEY, String(TOUR_VERSION));
      }
    } catch {
      /* ignore */
    } finally {
      hydrated.current = true;
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const { phase, essentialIdx, completed, goal, railDismissed } = state;
      localStorage.setItem(
        TOUR_STORAGE_KEY,
        JSON.stringify({ phase, essentialIdx, completed, goal, railDismissed }),
      );
    } catch {
      /* ignore */
    }
  }, [state]);

  const api = useMemo<TourApi>(
    () => ({
      state,
      totalSteps: TOTAL_STEPS,
      start: () => dispatch({ type: "start" }),
      startEssentials: () => dispatch({ type: "startEssentials" }),
      next: () => dispatch({ type: "next" }),
      prev: () => dispatch({ type: "prev" }),
      skipStep: () => dispatch({ type: "skipStep" }),
      skipAll: () => dispatch({ type: "skipAll" }),
      openChecklist: (id) => dispatch({ type: "openChecklist", id }),
      dismissActive: () => dispatch({ type: "dismissActive" }),
      toggleRail: () => dispatch({ type: "toggleRail" }),
      setGoal: (g) => dispatch({ type: "setGoal", goal: g }),
      restart: () => dispatch({ type: "restart" }),
      finish: () => dispatch({ type: "finish" }),
    }),
    [state],
  );

  return <TourContext.Provider value={api}>{children}</TourContext.Provider>;
}

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside <TourProvider>");
  return ctx;
}

export { ESSENTIAL_STEPS, CHECKLIST_STEPS, ALL_STEPS };
