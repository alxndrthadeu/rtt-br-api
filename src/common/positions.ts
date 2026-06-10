// Códigos canônicos de posição usados em todo o domínio.
// O banco deve conter apenas estes valores (seed.ts normaliza MEIA/ME/MD -> MEI).
export const POSITIONS = ['GK', 'ZAG', 'LD', 'LE', 'MEI', 'PD', 'PE', 'CA'] as const;

export type Position = (typeof POSITIONS)[number];
