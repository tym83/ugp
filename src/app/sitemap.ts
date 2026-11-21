import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { isHiddenEvent } from "@/lib/domain/hiddenEvent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, categories] = await Promise.all([
    prisma.event.findMany({ select: { id: true, slug: true, createdAt: true } }),
    // только категории с заявками (публично видимые сетки)
    prisma.category.findMany({
      where: { registrations: { some: {} } },
      select: { id: true, event: { select: { slug: true } } },
    }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/coaches`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/partners`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/reglament`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const eventRoutes: MetadataRoute.Sitemap = events.filter((e) => !isHiddenEvent(e)).map((e) => ({
    url: `${siteUrl}/event/${e.id}`,
    lastModified: e.createdAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.filter((c) => !isHiddenEvent(c.event)).map((c) => ({
    url: `${siteUrl}/category/${c.id}`,
    changeFrequency: "hourly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...eventRoutes, ...categoryRoutes];
}
