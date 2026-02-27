import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { mainNavigation, accountsGroup, toolsGroup, settingsItem } from "@/config/navigation";

export const MobileHeader = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-background/95 backdrop-blur-lg border-b border-border/50 shadow-sm z-50 md:hidden">
        <div className="flex items-center justify-between h-full px-4">
          <div className="w-10" />
          <span className="text-lg font-bold text-primary">JMRVY CB</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            className="h-10 w-10"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[280px] p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-left">Menu</SheetTitle>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto py-4">
            <div className="space-y-1 px-3">
              {/* Main Navigation */}
              <div className="mb-4">
                {mainNavigation.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/70"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{t(item.nameKey)}</span>
                    </Link>
                  );
                })}
              </div>

              <Separator className="my-2" />

              {/* Comptes Group */}
              <div className="mb-4">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                  {t(accountsGroup.labelKey)}
                </div>
                {accountsGroup.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/70"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{t(item.nameKey)}</span>
                    </Link>
                  );
                })}
              </div>

              <Separator className="my-2" />

              {/* Outils Group */}
              <div className="mb-4">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                  {t(toolsGroup.labelKey)}
                </div>
                {toolsGroup.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/70"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{t(item.nameKey)}</span>
                    </Link>
                  );
                })}
              </div>

              <Separator className="my-2" />

              {/* Settings */}
              <Link
                to={settingsItem.path}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive(settingsItem.path)
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70"
                )}
              >
                <settingsItem.icon className="h-5 w-5" />
                <span>{t(settingsItem.nameKey)}</span>
              </Link>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
};
