"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "./LogoutButton";

const LINKS = [
  { href: "/cockpit", label: "Cockpit" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/dividas", label: "Dívidas" },
  { href: "/configuracoes", label: "Configurações" },
] as const;

export function Topbar() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
      <span className="font-bold">Finanças</span>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        className="text-2xl leading-none"
      >
        ☰
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setAberto(false)}
          />
          <nav className="absolute inset-y-0 left-0 flex h-full w-64 max-w-[80vw] flex-col gap-1 border-r bg-background p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-bold">Finanças</span>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="text-2xl leading-none"
              >
                ×
              </button>
            </div>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setAberto(false)}
                className={`rounded px-3 py-2 text-sm ${
                  pathname === link.href ? "bg-black/10 font-semibold" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-auto border-t pt-4">
              <LogoutButton />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
