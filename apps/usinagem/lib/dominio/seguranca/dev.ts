/** Seletor de perfil de dev: as duas condições juntas, em valor exato. Qualquer outra combinação fecha. */
export const seletorDevAtivo = (env: { NODE_ENV?: string; ENABLE_DEV_SWITCHER?: string }): boolean =>
  env.NODE_ENV === "development" && env.ENABLE_DEV_SWITCHER === "1";
