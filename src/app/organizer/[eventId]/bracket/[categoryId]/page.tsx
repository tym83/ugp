import { prisma } from "@/lib/prisma";
import { getCurrentUser, hasRole } from "@/lib/auth/session";
import { findBracketConflicts } from "@/app/organizer-actions";
import Link from "next/link";
import BracketEdit from "../../BracketEdit";

export const dynamic = "force-dynamic";

export default async function BracketEditPage({
  params,
}: {
  params: Promise<{ eventId: string; categoryId: string }>;
}) {
  const { eventId, categoryId } = await params;
  const user = await getCurrentUser();
  if (!hasRole(user, "ORGANIZER", "ADMIN")) {
    return (
      <main className="p-8">
        Нужна роль организатора. <Link className="text-blue-600" href="/login">Войти</Link>
      </main>
    );
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || category.eventId !== eventId) return <main className="p-8">Категория не найдена</main>;

  const label = `${category.ageGroupLabel} · ${category.sex === "M" ? "муж" : "жен"} · ${category.discipline} · ${
    category.isAbsolute ? "абс" : category.isOpenTop ? `св.${category.weightMin}` : `до${category.weightMax}`
  }`;

  const { seeds, conflicts } = await findBracketConflicts(categoryId);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href={`/organizer/${eventId}`} className="text-sm text-blue-600">← Пульт организатора</Link>
      <h1 className="text-2xl font-bold mt-2">Правка сетки</h1>
      <p className="text-sm text-gray-500 mb-4">{label}</p>
      <BracketEdit categoryId={categoryId} seeds={seeds} conflicts={conflicts} />
    </main>
  );
}
