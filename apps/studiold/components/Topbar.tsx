"use client";

// Topbar compartilhada (agenda e configurações): logo + botão hambúrguer que
// abre um drawer de navegação pela esquerda. Controles específicos de cada
// página entram como children, à direita.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./agenda/Icon";
import { LogoutButton } from "@/components/LogoutButton";
import styles from "@/app/agenda/agenda.module.css";

type ItemNav = {
  href: string;
  label: string;
  icone: "calendar" | "cash" | "music" | "user" | "gear";
};

const PRINCIPAIS: ItemNav[] = [
  { href: "/agenda", label: "Agenda", icone: "calendar" },
  { href: "/clientes", label: "Clientes", icone: "user" },
  { href: "/financeiro", label: "Caixa", icone: "cash" },
];

const GERENCIAR: ItemNav[] = [
  { href: "/configuracoes", label: "Ajustes", icone: "gear" },
];

export function Topbar({
  titulo,
  children,
  sub,
}: {
  titulo?: string;
  children?: ReactNode;
  sub?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <header className={styles.topbar}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            className={`${styles.navbtn} inline-flex items-center justify-center p-1.5`}
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
            aria-expanded={aberto}
          >
            <Icon name="menu" size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
          <img
            src="/studiold-logo.svg"
            alt="StudiOLD"
            className="h-8 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
          {titulo && (
            <span className="hidden text-xs uppercase tracking-widest opacity-50 sm:inline">
              {titulo}
            </span>
          )}
          {children && (
            <div className="ml-auto flex items-center gap-1.5">{children}</div>
          )}
        </div>
        {sub && (
          <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">{sub}</div>
        )}
      </header>

      {aberto && <NavDrawer onClose={() => setAberto(false)} />}
    </>
  );
}

function NavDrawer({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const ativo = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <>
      <div className={styles.navScrim} onClick={onClose} aria-hidden="true" />
      <nav className={styles.navDrawer} aria-label="Navegação">
        <div className={styles.navHead}>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
          <img
            src="/studiold-logo.svg"
            alt="StudiOLD"
            className="h-7 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
          <button
            type="button"
            className={styles.iconbtn}
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <Icon name="x" />
          </button>
        </div>

        <div className={styles.navList}>
          {PRINCIPAIS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={styles.navItem}
              data-active={ativo(it.href) ? "true" : undefined}
              aria-current={ativo(it.href) ? "page" : undefined}
              onClick={onClose}
            >
              <Icon name={it.icone} size={17} />
              {it.label}
            </Link>
          ))}

          <div className={styles.navDivider} role="separator" />

          <p className={styles.navSection}>
            <Icon name="gear" size={15} /> Gerenciar
          </p>
          {GERENCIAR.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`${styles.navItem} ${styles.navItemSub}`}
              data-active={ativo(it.href) ? "true" : undefined}
              aria-current={ativo(it.href) ? "page" : undefined}
              onClick={onClose}
            >
              <Icon name={it.icone} size={17} />
              {it.label}
            </Link>
          ))}

          <div className={styles.navDivider} role="separator" />
          <LogoutButton />
        </div>
      </nav>
    </>
  );
}
