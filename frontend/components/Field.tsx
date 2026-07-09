"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#aaaaaa]">
        {label}
      </span>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-md border border-white/10 bg-[#1c1c1c] px-3.5 py-2.5 text-sm text-white placeholder-[#3d3d3d] outline-none transition focus:border-white/30 focus:ring-1 focus:ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${isPassword ? "pr-10" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={disabled}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666] transition hover:text-[#ccc] disabled:opacity-50"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </label>
  );
}
