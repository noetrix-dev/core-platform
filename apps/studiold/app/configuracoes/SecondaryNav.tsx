"use client";

// Abas horizontais de /configuracoes/*. Marca a ativa por usePathname.
// Rola horizontal no mobile. Piso visual: .chip; refino pelo /impeccable shape.

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/agenda/agenda.module.css";

const SECOES = [
  { href: "/configuracoes/cortesias", label: "Cortesias" },
  { href: "/configuracoes/estilos", label: "Estilos de música" },
  { href: "/configuracoes/servicos", label: "Serviços" },
  { href: "/configuracoes/produtos", label: "Produtos" },
  { href: "/configuracoes/horarios", label: "Horário de funcionamento" },
];

export function SecondaryNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Seções de configurações"
      className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3 sm:px-6"
    >
      {SECOES.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={styles.chip}
          data-on={pathname === s.href}
          aria-current={pathname === s.href ? "page" : undefined}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
