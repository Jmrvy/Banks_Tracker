import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.10), transparent 60%)" }}
      />
      <div className="ft-card w-full max-w-md p-8 sm:p-10 relative text-center">
        <div className="ft-eyebrow mb-2">Error 404</div>
        <h1 className="font-mono text-6xl sm:text-7xl font-semibold tracking-tight mb-3">404</h1>
        <p className="text-sm sm:text-base text-muted-foreground mb-6">
          {t("common.pageNotFound")}
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("common.returnHome")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
