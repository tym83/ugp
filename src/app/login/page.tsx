import { signInAction } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold mb-4">Вход</h1>
      {e && <p className="text-red-600 text-sm mb-3">Неверный email или пароль</p>}
      <form action={signInAction} className="space-y-3">
        <input name="email" type="email" placeholder="email" className="w-full border rounded px-3 py-2" required />
        <input name="password" type="password" placeholder="пароль" className="w-full border rounded px-3 py-2" required />
        <button className="w-full rounded bg-blue-600 px-4 py-2 text-white">Войти</button>
      </form>
      <div className="mt-6 text-xs text-gray-500">
        <p className="font-semibold">Демо-аккаунты (пароль: demo):</p>
        <ul className="mt-1 space-y-0.5">
          <li>admin@ugp.local — админ</li>
          <li>org@ugp.local — организатор</li>
          <li>coach@ugp.local — тренер</li>
          <li>ref@ugp.local — судья</li>
          <li>athlete@ugp.local — участник</li>
        </ul>
      </div>
    </main>
  );
}
