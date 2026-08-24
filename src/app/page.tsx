import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await prisma.event.findMany({ orderBy: { date: "asc" } });
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-bold mb-2">Underground Grappling Platform</h1>
      <p className="text-gray-500 mb-8">Регистрация и проведение турниров по грэпплингу / BJJ.</p>
      <h2 className="text-xl font-semibold mb-3">События</h2>
      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="rounded-lg border p-4 hover:bg-gray-50">
            <Link href={`/event/${e.id}`} className="block">
              <div className="font-semibold">{e.name}</div>
              <div className="text-sm text-gray-500">
                {new Date(e.date).toLocaleDateString("ru-RU")} · {e.city} · {e.venue}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
