import type { Metadata } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import BrandHeader from "@/components/BrandHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Заголовочный шрифт — тяжёлый дерзкий дисплей (кириллица есть).
const heading = Unbounded({
  variable: "--font-heading",
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700", "800"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Underground Grappling Platform — турниры по грэпплингу и BJJ",
    template: "%s · Underground Grappling Platform",
  },
  description:
    "Регистрация и проведение турниров по грэпплингу и BJJ: онлайн-заявки, сетки, живой прогресс схваток и командный зачёт.",
  openGraph: {
    type: "website",
    siteName: "Underground Grappling",
    locale: "ru_RU",
    title: "Underground Grappling — турниры по грэпплингу",
    description:
      "Регистрация и проведение турниров по грэпплингу и BJJ: онлайн-заявки, сетки, живой прогресс схваток.",
    images: ["/brand/hero-cover.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Underground Grappling",
    description: "Турниры по грэпплингу и BJJ: заявки, сетки, живой прогресс схваток.",
    images: ["/brand/hero-cover.jpg"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} ${heading.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BrandHeader />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
