// language.ts (FR) — see messages/en/language.ts.

import type { Messages } from '../en'

export const language: Messages['language'] = {
  label: 'Langue',
  hint: "Langue de l'application sur tous vos appareils.",
  auto: (p) => `Automatique (${p.browser})`,
}
