import { signInAction } from "@/app/auth-actions";
import Link from "next/link";
import PasswordField from "@/components/PasswordField";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  const nextQ = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold mb-4">Вход</h1>
      {e && <p className="text-red-600 text-sm mb-3">Неверный email или пароль. Проверьте раскладку и попробуйте снова.</p>}
      <form action={signInAction} className="space-y-3">
        {next && <input type="hidden" name="next" value={next} />}
        <input name="email" type="email" placeholder="email" className="w-full border rounded px-3 py-2" required />
        <PasswordField placeholder="пароль" />
        <button className="w-full rounded bg-blue-600 px-4 py-2 text-white">Войти</button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Нет аккаунта? <Link href={`/signup${nextQ}`} className="text-blue-600 font-medium">Зарегистрироваться</Link>
      </p>
    </main>
  );
}
