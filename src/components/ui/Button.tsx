import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
          {
            // Variants
            "bg-indigo-600 hover:bg-indigo-700 text-white": variant === "primary",
            // ghost uses CSS vars via inline style — see below
            "hover:bg-red-500/15 text-red-400 hover:text-red-300": variant === "danger",
            // Sizes
            "text-xs px-2 py-1 gap-1":  size === "sm",
            "text-sm px-3 py-2 gap-1.5": size === "md",
            "w-7 h-7 p-0":              size === "icon",
          },
          className
        )}
        style={
          variant === "ghost"
            ? ({ "--hover-bg": "var(--app-hover-strong)" } as React.CSSProperties)
            : undefined
        }
        onMouseEnter={(e) => {
          if (variant === "ghost" && !props.disabled)
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "var(--app-hover-strong)";
        }}
        onMouseLeave={(e) => {
          if (variant === "ghost")
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
        }}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
