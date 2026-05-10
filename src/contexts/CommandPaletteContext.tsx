import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined);

/**
 * Holds the open/closed state for the global command palette so any surface
 * — sidebar search button, mobile menu, future shortcuts — can call
 * `togglePalette()` directly instead of dispatching a synthetic keyboard
 * event. The keyboard shortcut (⌘K / Ctrl+K) lives inside the palette
 * component itself; this context only owns the boolean state.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);
  const togglePalette = useCallback(() => setOpen((prev) => !prev), []);
  const value = useMemo(
    () => ({ open, setOpen, openPalette, closePalette, togglePalette }),
    [open, openPalette, closePalette, togglePalette]
  );
  return (
    <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
  }
  return ctx;
}
