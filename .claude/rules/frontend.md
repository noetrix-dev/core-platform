---
paths:
  - "apps/**/*.tsx"
  - "apps/**/*.ts"
---

# Frontend

- Mobile-first é obrigatório. Projete e valide primeiro em 375px de largura; o layout desktop é progressão, não o ponto de partida.
- Todo elemento interativo (botão, link, input, controle custom) tem `aria-label` ou label associado explícito.
- Não introduzir CSS global novo. Estilo vive em componentes/utilitários com escopo; `globals.css` fica como está.
- Contraste mínimo WCAG AA (4.5:1 para texto normal, 3:1 para texto grande e ícones).
- Toda a UI é em PT-BR — labels, mensagens, placeholders, erros, textos de estado vazio.
- Nunca usar Inter (ou uma única fonte) para tudo. Usar os tokens de tipografia do tema do cliente (tenant); a hierarquia vem dos tokens, não de tamanhos avulsos.

## Exceção: apps/usinagem

- Tokens da identidade Express (vermelho `#A81915`, grafite `#191919`/`#1A1A1A`, cobre `#B5652E`, fundo `#EEF0EE` com grid blueprint de 28 px) e as variáveis de tema do shadcn/ui vivem em `apps/usinagem/app/globals.css`. Fora disso, a regra de não criar CSS global vale.
- Tipografia: IBM Plex Sans e IBM Plex Mono via `next/font`.
- ERP de balcão: telas de operação são desenhadas para 1280 px e validadas também em 375 px (nada quebra, nada some, alvo de toque de 44 px).
