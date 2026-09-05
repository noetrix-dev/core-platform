import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const barlowCond = Barlow_Condensed({
  variable: "--font-barlow-cond",
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finanças",
  description: "Painel financeiro pessoal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${barlow.variable} ${barlowCond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
