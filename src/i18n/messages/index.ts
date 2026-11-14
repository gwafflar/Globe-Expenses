// messages/index.ts — one bundle per supported language.
// `Record<Language, Messages>` forces an entry for every language listed in
// languages.ts: adding 'de' there without registering a bundle here is a
// compile error.

import type { Language } from '../languages'
import { en, type Messages } from './en'
import { fr } from './fr'

export type { Messages }

export const MESSAGES: Record<Language, Messages> = { en, fr }
