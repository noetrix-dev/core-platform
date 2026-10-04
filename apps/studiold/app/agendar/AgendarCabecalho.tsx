// Faixa preto-fosco do topo de /agendar: logo da StudiOLD (SVG monocromático
// pintado com --matte-ink via mask — o arquivo não muda), etapa atual e
// "Voltar" quando a etapa permite.
import css from "./agendar.module.css";

export function AgendarCabecalho({ etapa, onVoltar }: { etapa: string; onVoltar?: () => void }) {
  return (
    <header className={css.faixa}>
      <div className={css.faixaInner}>
        {onVoltar ? (
          <button type="button" className={css.faixaVoltar} aria-label="Voltar" onClick={onVoltar}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        ) : (
          <span />
        )}
        <span className={css.logo} role="img" aria-label="StudiOLD" />
        <span />
        <p className={css.faixaEtapa}>{etapa}</p>
      </div>
    </header>
  );
}
