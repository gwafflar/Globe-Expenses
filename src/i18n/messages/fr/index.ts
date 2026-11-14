// fr/index.ts — the French bundle. Typed as `Messages`, so it cannot compile
// while a key is missing, extra, or has a different function signature.

import type { Messages } from '../en'
import { common } from './common'
import { language } from './language'
import { auth } from './auth'
import { profile } from './profile'
import { social } from './social'
import { transactionForm } from './transactionForm'
import { transactions } from './transactions'
import { spaces } from './spaces'
import { transactionsTab } from './transactionsTab'
import { balance } from './balance'
import { parameters } from './parameters'
import { dashboard } from './dashboard'
import { importExport } from './importExport'

export const fr: Messages = {
  common,
  language,
  auth,
  profile,
  social,
  transactionForm,
  transactions,
  spaces,
  transactionsTab,
  balance,
  parameters,
  dashboard,
  importExport,
}
