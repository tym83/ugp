import { redirect } from "next/navigation";

// The manual lives at /organizer/help; keep old per-event links working.
export default function LegacyHelp() {
  redirect("/organizer/help");
}
