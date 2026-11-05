"use client";

import { useState } from "react";

/**
 * A read-only value with a Copy button (the calendar link, for apps that take a URL). The
 * classes default to the household theme's; the site look passes its own.
 */
export default function CopyField({
  id, label, value, labelClass = "field-label", inputClass = "field-input figure", buttonClass = "btn",
}: { id: string; label: string; value: string; labelClass?: string; inputClass?: string; buttonClass?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input className={`${inputClass} min-w-0`} id={id} value={value} readOnly spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className={`${buttonClass} shrink-0`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              document.getElementById(id)?.focus();
            }
          }}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
