import MeSearch from "@/components/MeSearch";
import Link from "next/link";

export const metadata = {
  title: "Найти свою сетку",
  description: "Поиск участника по имени — переход к сетке категории и кабинету.",
};

export default function MeSearchPage() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <Link href="/me" className="text-sm text-blue-600">← кабинет</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Найти свою сетку</h1>
      <p className="text-sm text-gray-500 mb-4">Введите имя участника.</p>
      <MeSearch />
    </main>
  );
}
