import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "@/components/ThemeProvider";

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, app will work without offline support
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="finance-app-theme">
    <App />
  </ThemeProvider>
);
