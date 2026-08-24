import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, categories] = await Promise.all([
    prisma.event.findMany({ select: { id: true, createdAt: true } }),
    // только категории с заявками (публично видимые сетки)
    prisma.category.findMany({
      where: { registrations: { some: {} } },
      select: { id: true },
    }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/coaches`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/sponsors`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const eventRoutes: MetadataRoute.Sitemap = events.map((e) => ({
    url: `${siteUrl}/event/${e.id}`,
    lastModified: e.createdAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${siteUrl}/category/${c.id}`,
    changeFrequency: "hourly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...eventRoutes, ...categoryRoutes];
}
