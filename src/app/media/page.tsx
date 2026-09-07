import { notFound } from "next/navigation";

// Страница «Медиа» временно отключена по просьбе организаторов.
// Чтобы вернуть — восстановить прежнее содержимое из истории git.
export const dynamic = "force-dynamic";

export default function MediaPage() {
  notFound();
}
