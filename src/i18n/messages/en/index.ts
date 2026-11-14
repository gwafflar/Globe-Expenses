// en/index.ts — the English bundle, assembled from one file per app area.
//
// `Messages` (the type of this object) is the contract every other language
// must satisfy: same keys, same nesting, same function signatures.

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

export const en = {
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

export type Messages = typeof en
