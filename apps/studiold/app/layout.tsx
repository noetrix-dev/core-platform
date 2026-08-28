import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
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
  title: "Agenda — StudiOLD",
  description: "Agenda do dia da StudiOLD: pilha de fichas, fila de espera e encaixes.",
};

/*
  DIRECTION CONTRACT — A ESTAÇÃO DO BARBEIRO (rota /agenda). Seed key 8d732202.
  THESIS: o dia é uma pilha de fichas de cliente na prateleira da estação, lida de
  cima até o agora até o fim; recusa a grade semana/dia com blocos posicionados por
  duração.
  OWN-WORLD: chão de esmalte quente #EDEAE3 com poeira de terrazzo, estrutura
  preto-fosco #211E1B, fios de cromo #C9C6BC gravados a 1px, canto de 2px; oxblood
  #7B2D26 é o agora e a ação, aço/ocre/sálvia carregam status; Barlow Condensed nos
  rótulos e horas, Barlow no corpo; sem sombra solta, sem arredondado de SaaS.
  STORY: o barbeiro abre no início do turno e deixa aberto; um relance diz quem está
  na cadeira, quem é o próximo, onde o dia tem buraco; buraco que abre de um
  cancelamento já sai oferecido à fila/encaixe antes de alguém tocar; status anda com
  um toque na própria ficha.
  FIRST VIEWPORT: barra preto-fosco com marca StudiOLD, navegação de dia e pip do
  WhatsApp, data longa abaixo; esquerda é a pilha com calha de horas, fichas em ordem
  e a ficha da vez puxada e ampliada "no espelho"; vãos são espaço pautado clicável;
  barra oxblood do AGORA corta a pilha; direita sticky é a moldura de exceções (FILA e
  ENCAIXE em tiras com clipe e contador) e a bancada Walk-in / Agendar / Bloquear.
  FORM: pilha cronológica com item herói ampliado; candidato 5 de 7 da lista
  fundamentada; roll degradado.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
  review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
*/

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${barlow.variable} ${barlowCond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html:
              "<!-- impeccable:direction A Estação do Barbeiro · seed 8d732202 · code-led (degraded roll) -->",
          }}
        />
        {children}
      </body>
    </html>
  );
}
