"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "@/app/agenda/agenda.module.css";

export function Drawer({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    painel.current?.querySelector<HTMLElement>(
      "input,select,button,[tabindex]",
    )?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={painel}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className={styles.drawer__head}>
          <span>{titulo}</span>
          <button
            type="button"
            className={styles.iconbtn}
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}
