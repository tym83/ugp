import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/session";
import OfflineConsole from "./OfflineConsole";

export const dynamic = "force-dynamic";

export default async function OfflineConsolePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventParam } = await params;
  await requirePageRole("ORGANIZER", "ADMIN");
  const event = await prisma.event.findFirst({ where: { OR: [{ slug: eventParam }, { id: eventParam }] } });
  if (!event) return <main className="p-8">Событие не найдено</main>;
  return (
    <main className="mx-auto max-w-7xl p-4">
      {/* plain <a>: a soft navigation would need the network */}
      <a href={`/organizer/${event.slug ?? event.id}`} className="text-sm text-blue-600">← Пульт организатора</a>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Сетки и результаты — работает без интернета</h1>
      <p className="mb-4 text-sm text-gray-500">
        Откройте страницу один раз с интернетом. Дальше результаты сохраняются на этом устройстве, сетка двигается сразу,
        а на сайт всё уходит само, как только появится связь.
      </p>
      <OfflineConsole eventId={event.id} eventName={event.name} />
    </main>
  );
}
