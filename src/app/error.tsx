"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold mb-2">Что-то пошло не так</h1>
      <p className="text-sm text-gray-600 mb-4">
        Не удалось загрузить страницу. Проверьте соединение и попробуйте ещё раз.
      </p>
      <button
        onClick={() => reset()}
        className="rounded bg-blue-600 px-4 py-2 text-white text-sm"
      >
        Повторить
      </button>
    </main>
  );
}
