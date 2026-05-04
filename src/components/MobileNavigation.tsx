import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Plus, Menu } from "lucide-react";
import { mainNavigation, accountsGroup, toolsGroup, settingsItem, mobileBottomNav } from "@/config/navigation";

export const MobileNavigation = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-line z-50 md:hidden safe-area-inset-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {/* Home and Accounts from config */}
          {mobileBottomNav.map((item) => {
            const isItemActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                onClick={() => navigate(item.path)}
                className={`flex flex-col h-12 flex-1 max-w-[72px] gap-0.5 px-1 rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isItemActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-bg-hover"
                }`}
              >
                <Icon className={`h-5 w-5 transition-transform ${isItemActive ? 'scale-110' : ''}`} />
                <span className={`text-xs leading-tight font-medium ${isItemActive ? 'font-semibold' : ''}`}>
                  {t(item.nameKey)}
                </span>
              </Button>
            );
          })}

          {/* Add Transaction Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/new-transaction")}
            className={`flex flex-col h-12 flex-1 max-w-[72px] gap-0.5 px-1 rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              location.pathname === "/new-transaction"
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-bg-hover"
            }`}
          >
            <Plus className={`h-5 w-5 transition-transform ${location.pathname === "/new-transaction" ? 'scale-110' : ''}`} />
            <span className={`text-xs leading-tight font-medium ${location.pathname === "/new-transaction" ? 'font-semibold' : ''}`}>
              {t('common.add')}
            </span>
          </Button>

          {/* Menu button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(true)}
            className="flex flex-col h-12 flex-1 max-w-[72px] gap-0.5 px-1 rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background text-muted-foreground hover:text-foreground hover:bg-bg-hover"
          >
            <Menu className="h-5 w-5" />
            <span className="text-xs leading-tight font-medium">{t('common.menu')}</span>
          </Button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[280px] p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-left">{t('common.menu')}</SheetTitle>
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
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
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
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
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
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
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
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
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
