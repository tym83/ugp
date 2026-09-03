import { signUpAction } from "@/app/auth-actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "Укажите фамилию и имя (не короче 2 символов).",
  email: "Проверьте email — кажется, он введён с ошибкой.",
  weak: "Пароль слишком короткий — минимум 6 символов.",
  dup: "На этот email уже есть аккаунт. Попробуйте войти.",
  rate: "Слишком много попыток. Подождите пару минут и повторите.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  const nextQ = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold mb-1">Регистрация аккаунта</h1>
      <p className="text-sm text-gray-500 mb-4">Аккаунт нужен, чтобы подавать заявки на турниры и видеть свои сетки.</p>
      {e && <p className="text-red-600 text-sm mb-3">{ERRORS[e] ?? "Проверьте правильность заполнения полей."}</p>}
      <form action={signUpAction} className="space-y-3">
        {next && <input type="hidden" name="next" value={next} />}
        <input name="fullName" placeholder="Фамилия Имя" className="w-full border rounded px-3 py-2" required />
        <input name="email" type="email" placeholder="email" className="w-full border rounded px-3 py-2" required />
        <input name="password" type="password" placeholder="пароль (минимум 6 символов)" className="w-full border rounded px-3 py-2" required minLength={6} />
        <button className="w-full rounded bg-blue-600 px-4 py-2 text-white">Создать аккаунт</button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Уже есть аккаунт? <Link href={`/login${nextQ}`} className="text-blue-600 font-medium">Войти</Link>
      </p>
    </main>
  );
}
