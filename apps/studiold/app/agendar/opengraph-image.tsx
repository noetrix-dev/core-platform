// Imagem de compartilhamento (og:image) de /agendar: PNG 1200×630 gerado pelo
// Next a partir da logo. A logo original é monocromática escura (#231f20) e
// sumiria no fundo preto, então a cor é trocada pelo --matte-ink na hora.
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "StudiOLD — Agendar horário";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const svg = (await readFile(join(process.cwd(), "public/studiold-logo.svg"), "utf8")).replaceAll(
    "#231f20",
    "#ded9cf",
  );
  const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0A0A0A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={logo} width={720} height={138} alt="" />
      </div>
    ),
    size,
  );
}
