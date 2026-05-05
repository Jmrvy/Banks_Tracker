import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { CATEGORY_ICON_GROUPS } from "@/lib/categoryIcons";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CategoryIconPickerProps {
  value: string | null;
  color: string;
  onChange: (icon: string | null) => void;
}

export function CategoryIconPicker({ value, color, onChange }: CategoryIconPickerProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return CATEGORY_ICON_GROUPS;
    return CATEGORY_ICON_GROUPS.map((g) => ({
      ...g,
      icons: g.icons.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.keywords.includes(q)
      ),
    })).filter((g) => g.icons.length > 0);
  }, [filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("categoryIcons.searchPlaceholder", { defaultValue: "Search icons..." })}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line text-xs font-medium transition-colors",
            value === null
              ? "bg-bg-subtle text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-bg-hover"
          )}
        >
          <X className="h-3 w-3" />
          {t("categoryIcons.noIcon", { defaultValue: "No icon" })}
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto pr-1 flex flex-col gap-3">
        {groups.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t("categoryIcons.noResults", { defaultValue: "No icons match your search" })}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.groupKey} className="flex flex-col gap-1.5">
            <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/80">
              {t(group.groupKey, { defaultValue: group.groupDefault })}
            </p>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
              {group.icons.map((entry) => {
                const active = value === entry.name;
                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => onChange(entry.name)}
                    className={cn(
                      "h-9 rounded-md border flex items-center justify-center transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-line hover:bg-bg-hover hover:border-line-strong"
                    )}
                    aria-pressed={active}
                    aria-label={entry.name}
                  >
                    <CategoryIcon icon={entry.name} color={color} size={22} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
