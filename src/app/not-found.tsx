import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold mb-2">Страница не найдена</h1>
      <p className="text-sm text-gray-600 mb-4">Возможно, ссылка устарела или введена неверно.</p>
      <Link href="/" className="text-blue-600 text-sm">← На главную</Link>
    </main>
  );
}
