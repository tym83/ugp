import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import EditParticipantForm from "@/components/EditParticipantForm";

export const dynamic = "force-dynamic";

function safeNext(v: string | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/organizer";
}

export default async function EditParticipantPage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { athleteId } = await params;
  const { next: nextRaw } = await searchParams;
  const next = safeNext(nextRaw);

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const roles = new Set(user.memberships.map((m) => m.role));
  const isOrg = roles.has("ORGANIZER") || roles.has("ADMIN");
  const isCoach = roles.has("COACH");

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, include: { club: true } });
  if (!athlete) return <main className="mx-auto max-w-lg p-8">Участник не найден. <Link href={next} className="text-blue-600">← назад</Link></main>;

  const owns = isCoach && athlete.coachUserId === user.id;
  if (!isOrg && !owns) return <main className="mx-auto max-w-lg p-8">Нет прав на редактирование этого участника. <Link href={next} className="text-blue-600">← назад</Link></main>;

  const data = {
    id: athlete.id,
    fullName: athlete.fullName,
    phone: athlete.phone ?? "",
    city: athlete.city ?? "",
    club: athlete.club?.name ?? "",
    belt: athlete.belt ?? "",
    birthDate: athlete.birthDate.toISOString().slice(0, 10),
    sex: (athlete.sex === "F" ? "F" : "M") as "M" | "F",
  };

  return (
    <main className="mx-auto max-w-lg p-8">
      <Link href={next} className="text-sm text-blue-600">← назад</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">Анкета участника</h1>
      <EditParticipantForm data={data} canSeePhone={isOrg} next={next} />
    </main>
  );
}
