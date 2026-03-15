import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Theme, useTheme } from "@/contexts/ThemeContext";
import { useT } from "@/i18n/context";

const CYCLE: Theme[] = ["system", "light", "dark"];

const ICONS: Record<Theme, React.ElementType> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useT();

  const tooltipKeys: Record<Theme, string> = {
    system: "theme.system",
    light: "theme.light",
    dark: "theme.dark",
  };

  function cycle() {
    const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
    setTheme(next);
  }

  const Icon = ICONS[theme];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={cycle} className="h-8 w-8">
          <Icon className="h-4 w-4" />
          <span className="sr-only">{t(tooltipKeys[theme])}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t(tooltipKeys[theme])}</TooltipContent>
    </Tooltip>
  );
}
