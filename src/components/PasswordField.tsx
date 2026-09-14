"use client";
import { useState } from "react";

/** Поле пароля с кнопкой показать/скрыть — чтобы видеть, что вводишь. */
export default function PasswordField({
  name = "password",
  placeholder = "пароль",
  required = true,
  minLength,
}: {
  name?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="w-full border rounded px-3 py-2 pr-16"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 px-3 text-sm text-gray-500 hover:text-gray-800"
        aria-label={show ? "Скрыть пароль" : "Показать пароль"}
      >
        {show ? "скрыть" : "показать"}
      </button>
    </div>
  );
}
