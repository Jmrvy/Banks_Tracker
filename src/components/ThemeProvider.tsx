import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  /** What is actually painted — `theme`, with "system" resolved against the OS. */
  resolvedTheme: "dark" | "light"
  setTheme: (theme: Theme) => void
}

const DARK_QUERY = "(prefers-color-scheme: dark)"

const prefersDark = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(DARK_QUERY).matches

const initialState: ThemeProviderState = {
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )
  // Tracked as state so a "system" preference repaints when the OS flips —
  // reading matchMedia once during an effect left the class stale forever.
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark)

  useEffect(() => {
    if (theme !== "system") return
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)

    setSystemDark(media.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme])

  const resolvedTheme: "dark" | "light" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
    root.setAttribute("data-theme", resolvedTheme)
  }, [resolvedTheme])

  const handleSetTheme = useCallback((theme: Theme) => {
    localStorage.setItem(storageKey, theme)
    setTheme(theme)
  }, [storageKey])

  const value = useMemo(() => ({
    theme,
    resolvedTheme,
    setTheme: handleSetTheme,
  }), [theme, resolvedTheme, handleSetTheme])

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
