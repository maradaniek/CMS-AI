import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Woeler CMS",
  description: "AI-beheer voor WaaS 2.0-sites. Tekst, themablokken, SEO, cases en blogs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className={`${manrope.variable} h-full antialiased`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Pliant:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full bg-[#f8f7f6] text-[#061122]"
        style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
