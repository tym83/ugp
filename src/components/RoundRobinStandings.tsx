import { rankRoundRobin, roundRobinStats, type RoundRobinMatch } from "@/lib/domain/roundRobin";

export default function RoundRobinStandings({ matches, override, names, publicView = false }: {
  matches: RoundRobinMatch[];
  override?: string[] | null;
  names: Record<string, string>;
  publicView?: boolean;
}) {
  const ranking = rankRoundRobin(matches, override);
  const stats = roundRobinStats(matches);
  const complete = matches.length > 0 && matches.every((m) => m.status === "COMPLETED");
  const tied = new Set(ranking.tiedGroups.flat());
  return <section className="my-5 overflow-x-auto">
    <h2 className="mb-2 font-semibold">Итог круговой</h2>
    <table className="w-full text-sm">
      <thead><tr>{["Участник", "Победы", "Победы сдачей", "Место"].map((h) => <th className="border p-2 text-left" key={h}>{h}</th>)}</tr></thead>
      <tbody>{ranking.order.map((id, i) => <tr key={id}>
        <td className="border p-2">{names[id] ?? "—"}</td>
        <td className="border p-2">{stats.get(id)!.wins}</td>
        <td className="border p-2">{stats.get(id)!.submissions}</td>
        <td className="border p-2">{complete && !tied.has(id) ? i + 1 : "Не решено"}</td>
      </tr>)}</tbody>
    </table>
    {complete && !ranking.decided && <p className="mt-2">{publicView ? "Ничья — решает главный судья" : "Ничья — нужно решение главного судьи"}</p>}
  </section>;
}
