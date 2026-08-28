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
