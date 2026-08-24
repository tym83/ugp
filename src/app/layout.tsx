import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    siteName: "Underground Grappling Platform",
    locale: "ru_RU",
    title: "Underground Grappling Platform",
    description:
      "Регистрация и проведение турниров по грэпплингу и BJJ: онлайн-заявки, сетки, живой прогресс схваток.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
