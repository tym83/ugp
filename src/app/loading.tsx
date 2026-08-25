export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl p-8" aria-busy="true">
      <div className="text-sm text-gray-500 mb-4">Загрузка…</div>
      <div className="space-y-3 animate-pulse">
        <div className="h-6 w-1/2 rounded bg-gray-200" />
        <div className="h-20 rounded bg-gray-200" />
        <div className="h-20 rounded bg-gray-200" />
        <div className="h-20 rounded bg-gray-200" />
      </div>
    </main>
  );
}
