"use client";

import { useState, type InputHTMLAttributes } from "react";

export default function PasswordInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  return (
    <div>
      <div className="relative">
        <input
          {...props}
          type={visible ? "text" : "password"}
          onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
          className={`${className ?? ""} pr-16`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-brand-700 hover:underline"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {capsLockOn && (
        <p className="mt-1 text-xs text-amber-700">Caps Lock is on</p>
      )}
    </div>
  );
}
