import { m } from "motion/react";
import { spring } from "@/design/motion";
import { cn } from "@/lib/utils";

/** iOS-style segmented control with a sliding selection pill. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  id,
  small,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  id: string;
  small?: boolean;
}) {
  return (
    <div className="flex gap-0.5 rounded-full bg-fill p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative flex-1 rounded-full font-semibold transition-colors ring-focus",
            small ? "h-8 text-[13px]" : "h-10 text-[14px]",
            value === o.value ? "text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          {value === o.value && (
            <m.span layoutId={`${id}-pill`} transition={spring.snappy} className="absolute inset-0 rounded-full bg-surface shadow-sm dark:bg-surface-2" />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
