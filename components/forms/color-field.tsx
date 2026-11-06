"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KIT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

/** Accepts `#10B981`, `10b981` or `#10b981` and returns `#10B981`. */
export function normaliseHex(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  return `#${trimmed.replace(/^#/, "").toUpperCase()}`;
}

/**
 * A colour picker paired with a visible hex code. The text input carries the
 * form `name`, so the normalised `#RRGGBB` value is what the server receives.
 */
export function ColorField({
  id,
  name,
  label,
  defaultValue = "#10B981",
  value,
  onChange,
  disabled,
  compact,
  swatches = false,
  hint,
  className,
}: {
  id?: string;
  name: string;
  label?: ReactNode;
  defaultValue?: string;
  value?: string;
  onChange?: (next: string) => void;
  disabled?: boolean;
  compact?: boolean;
  swatches?: boolean;
  hint?: string;
  className?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? `colour-${generatedId}`;

  const [internal, setInternal] = useState(() => normaliseHex(defaultValue) ?? "#10B981");
  const current = value !== undefined ? normaliseHex(value) ?? internal : internal;
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    setDraft(current);
  }, [current]);

  function apply(next: string) {
    const normalised = normaliseHex(next);
    if (!normalised) return;
    setInternal(normalised);
    setDraft(normalised);
    onChange?.(normalised);
  }

  const invalid = draft.trim().length > 0 && !normaliseHex(draft);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId} className="flex items-center gap-1.5">
            {label}
          </Label>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            {current}
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={typeof label === "string" ? `${label} picker` : "Colour picker"}
          value={current}
          disabled={disabled}
          onChange={(event) => apply(event.target.value)}
          className={cn(
            "shrink-0 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50",
            compact ? "h-9 w-10" : "h-10 w-12",
          )}
        />
        <Input
          id={inputId}
          name={name}
          value={draft}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          placeholder="#10B981"
          aria-invalid={invalid}
          onChange={(event) => {
            const next = event.target.value;
            const normalised = normaliseHex(next);
            // Store the normalised `#RRGGBB` as soon as the input is valid, so the
            // value that reaches the server always carries the leading `#`.
            setDraft(normalised ?? next);
            if (normalised) {
              setInternal(normalised);
              onChange?.(normalised);
            }
          }}
          onBlur={() => {
            const normalised = normaliseHex(draft);
            if (normalised) setDraft(normalised);
          }}
          className={cn(
            "font-mono uppercase",
            compact ? "h-9 text-xs" : "h-10",
            invalid && "border-rose-400 focus-visible:ring-rose-400",
          )}
        />
      </div>

      {swatches ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {KIT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => apply(color)}
              disabled={disabled}
              aria-label={`Use ${color}`}
              aria-pressed={current.toLowerCase() === color.toLowerCase()}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50",
                current.toLowerCase() === color.toLowerCase()
                  ? "border-slate-900 ring-2 ring-slate-900/20 dark:border-white dark:ring-white/30"
                  : "border-white shadow dark:border-slate-700",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      ) : null}

      {invalid ? (
        <p className="text-[11px] font-medium text-rose-600">
          Use a 6-digit hex code like #10B981.
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
