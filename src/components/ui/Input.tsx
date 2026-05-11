import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, style, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full text-sm rounded-lg px-3 py-2 outline-none transition",
          "focus:ring-1 focus:ring-indigo-500",
          className
        )}
        style={{
          backgroundColor: "var(--app-bg-input)",
          color: "var(--app-text-primary)",
          border: "1px solid var(--app-border-strong)",
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--color-accent)";
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--app-border-strong)";
          props.onBlur?.(e);
        }}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
