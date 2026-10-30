import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Toggle } from "@jaci/ui/Toggle";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@jaci/ui/Tooltip";

export function ThemeToggle({ variant = "default" }: { variant?: "default" | "subtle" }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            checked={isDark}
            onCheckedChange={toggleTheme}
            variant={variant}
            aria-label={
              isDark ? "Mudar para modo claro" : "Mudar para modo escuro"
            }
            thumbContent={
              isDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />
            }
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Alterar para{" "}
            <strong>{isDark ? "modo claro" : "modo escuro"}</strong>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
