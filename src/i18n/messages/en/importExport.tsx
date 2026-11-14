// importExport.tsx — XLSX import dialog and its steps, export dialogs.
// (The CONTENT of the exported workbook stays English — see SESSION_LOG.)
//
// .tsx rather than .ts: a few messages wrap a number or a name in <strong>,
// so they return JSX (ReactNode) instead of a plain string.

import type { ReactNode } from 'react'
import { plural } from '../../plural'

export const importExport = {
  /** Labels of the transaction's core columns (column-mapping dropdown). */
  coreFields: {
    date: 'Date',
    name: 'Description',
    totalAmount: 'Amount',
    currency: 'Currency',
    exchangeRate: 'Exchange rate',
  },
  /** Labels of the optional built-in fields (mapping, value step, export warning). */
  builtInFields: {
    country: 'Country',
    city: 'City',
    category: 'Category',
    paymentMethod: 'Payment method',
    notes: 'Notes',
  },
  transactionCount: (n: number) =>
    plural('en', n, { one: `${n} transaction`, other: `${n} transactions` }),
  /** Name given to an imported row that has an amount but no description.
   *  Written to Firestore as the transaction name, in the current language. */
  unnamedTransaction: '(unnamed)',
  import: 'Import',

  dialog: {
    title: 'Import from xlsx',
    steps: {
      upload: 'Step 1 — Upload',
      confirm: 'Step 2 of 2 — Confirm',
      mapping: 'Step 2 of 4 — Member mapping',
      preview: 'Step 3 of 4 — Data preview',
      columns: 'Step 2 — Match columns',
      fields: 'Step 3 — New fields',
      values: 'Last step — New values',
      result: 'Done',
    },
    /** `reason` is one of the `meta.*` sentences below. */
    metaFallback: (reason: string) => `${reason} Values will be matched by name instead.`,
    importFailed: 'The import failed.',
  },

  upload: {
    formatNotice:
      "A GlobeExpenses export imports in one tap. Any other spreadsheet works too — you'll be asked to match its columns to fields.",
    wrongExtension: 'Please upload a .xlsx file.',
    readFailed: 'Failed to read the file.',
    dropzone: 'Click to browse or drag and drop',
    dropzoneHint: 'GlobeExpenses .xlsx file',
    parsing: 'Parsing file…',
  },

  mapping: {
    intro: (p: { rows: number; slots: number }): ReactNode => (
      <>
        Found <strong>{p.rows}</strong> transactions across <strong>{p.slots}</strong>{' '}
        {plural('en', p.slots, { one: 'active member slot', other: 'active member slots' })}.
        Match each sheet member to a space member below.
      </>
    ),
    countMismatch: (p: { sheet: number; space: number }) =>
      `The sheet has ${p.sheet} ${plural('en', p.sheet, { one: 'member slot', other: 'member slots' })} but this space has ${p.space} ${plural('en', p.space, { one: 'member', other: 'members' })}. Check your mapping carefully.`,
    duplicates: 'Two sheet members are mapped to the same person. Please fix before continuing.',
    skippedWarning: 'Transactions involving skipped members will not be imported.',
    slotFallback: (n: number) => `Slot ${n}`,
    skipOption: "— Skip this member's transactions —",
    fixDuplicates: 'Fix duplicate mappings before proceeding.',
    /** Shown above the member table for a file from another space. */
    foreignSpace: (p: { name: ReactNode }): ReactNode => (
      <>
        This file was exported from <strong>{p.name}</strong>, a different space. Its members and
        field values don’t have matching ids here, so you’ll be asked to match them below.
      </>
    ),
  },

  result: {
    committed: (p: { committed: number; total: number }) =>
      `${p.committed} / ${p.total} transactions committed`,
    summary: (p: { imported: number; updated: number }) => {
      const parts: string[] = []
      if (p.imported > 0) {
        parts.push(plural('en', p.imported, {
          one: `${p.imported} new transaction imported`,
          other: `${p.imported} new transactions imported`,
        }))
      }
      if (p.updated > 0) {
        parts.push(plural('en', p.updated, {
          one: `${p.updated} transaction updated`,
          other: `${p.updated} transactions updated`,
        }))
      }
      return parts.length > 0 ? parts.join(', ') : 'No transactions imported'
    },
    skippedRows: (n: number) =>
      plural('en', n, { one: `${n} row skipped (empty)`, other: `${n} rows skipped (empty)` }),
    rowsWithErrors: (n: number) =>
      plural('en', n, { one: `${n} row had errors`, other: `${n} rows had errors` }),
    autoUpdate: 'The transaction list updates automatically.',
    /** Per-row problems collected by importParsedRows(). */
    costSkipped: (p: { row: number; name: string; slot: number }) =>
      `Row ${p.row} (${p.name}): slot ${p.slot} not mapped — cost skipped`,
    paidSkipped: (p: { row: number; name: string; slot: number }) =>
      `Row ${p.row} (${p.name}): slot ${p.slot} not mapped — paid skipped`,
  },

  confirm: {
    sameSpace:
      'This is a GlobeExpenses export of this space. Everything maps automatically — no matching needed.',
    space: 'Space',
    transactions: 'Transactions',
    members: 'Members',
    customFields: 'Custom fields',
    exported: 'Exported',
    renamed: (p: { name: string }) =>
      `The space was called “${p.name}” when this file was exported. It is the same space, so the import is unaffected.`,
    inPlace: 'Rows that came from this space are updated in place rather than duplicated.',
  },

  preview: {
    countries: 'Countries',
    cities: 'Cities',
    categories: 'Categories',
    paymentMethods: 'Payment methods',
    summary: (p: { rows: number; countries: number; cities: number; categories: number; paymentMethods: number }) =>
      `${p.rows} transactions · ${p.countries} countries · ${p.cities} cities · ${p.categories} categories · ${p.paymentMethods} payment methods`,
    allMatch: 'All values match the space configuration.',
    someUnmatched: "Some values don't match the space configuration. They will be imported as-is.",
    noValues: 'No values found.',
  },

  columns: {
    intro: (p: { rows: number; columns: number }): ReactNode => (
      <>
        Found <strong>{p.rows}</strong> {plural('en', p.rows, { one: 'row', other: 'rows' })} and{' '}
        <strong>{p.columns}</strong> {plural('en', p.columns, { one: 'column', other: 'columns' })}.
        Matching columns have been filled in — check them and correct anything wrong.
      </>
    ),
    /** `examples` is '' when the column has no values. */
    stats: (p: { count: number; examples: string }) =>
      `${plural('en', p.count, { one: `${p.count} value`, other: `${p.count} values` })}${p.examples ? ` · e.g. ${p.examples}` : ''}`,
    dontImport: "— Don't import —",
    groupTransaction: 'Transaction',
    groupFields: 'Fields',
    groupCustomFields: 'Custom fields',
    groupWho: 'Who',
    groupNew: 'New',
    cost: (name: string) => `Cost — ${name}`,
    paid: (name: string) => `Paid — ${name}`,
    createField: '+ Create a new field…',
    /** Placeholder header for a column whose header cell is empty. */
    columnFallback: (n: number) => `Column ${n}`,
    noReadableSheets: 'The workbook has no readable sheets.',
    // validateMapping()
    amountRequired: 'One column must be mapped to Amount.',
    duplicateTarget: (p: { count: number; field: string }) =>
      `${p.count} columns are mapped to the same field (${p.field}).`,
  },

  newFields: {
    typeLabels: {
      select: 'Choice list',
      text: 'Free text',
      boolean: 'Yes / no',
    },
    typeHints: {
      select: 'A fixed set of values you can filter and group by',
      text: 'Anything — searchable, but not groupable',
      boolean: 'A simple flag',
    },
    noneToCreate: 'No new fields to create. Go back if you meant to add one.',
    intro: 'These columns will become new fields in this space. Check the name and type of each.',
    limitReached: (n: number) => `You've reached the limit of ${n} new fields per import.`,
    fromColumn: (header: string) => `From column “${header}”`,
    dontImport: "Don't import",
    fieldName: 'Field name',
    type: 'Type',
    /** `type` is a typeLabels value; the message decides its casing. */
    suggested: (p: { type: string; evidence: string }) =>
      `Suggested ${p.type.toLowerCase()}: ${p.evidence}`,
    optionsCreated: (n: number) =>
      plural('en', n, { one: `${n} option will be created`, other: `${n} options will be created` }),
    // inferColumnType() evidence — shown so a wrong type guess is obvious.
    evidence: {
      noValues: 'No values to infer from',
      everyValueIsOneOf: (list: string) => `Every value is one of ${list}`,
      distinctInRows: (p: { distinct: number; rows: number }) =>
        `${plural('en', p.distinct, { one: `${p.distinct} distinct value`, other: `${p.distinct} distinct values` })} in ${plural('en', p.rows, { one: `${p.rows} row`, other: `${p.rows} rows` })}`,
      overDistinct: (n: number) => `over ${n} distinct values`,
      mostlyUnique: (reason: string) => `Mostly unique — ${reason}`,
    },
  },

  values: {
    nothingToDecide: 'Every value in the mapped columns already exists in this space. Nothing to decide.',
    intro: "Some columns contain values this space doesn't have yet. Choose what to do with each.",
    matchSummary: (p: { field: string; matched: number; unmatched: number }) =>
      `→ ${p.field} · ${p.matched} ${plural('en', p.matched, { one: 'match', other: 'matches' })}, ${p.unmatched} new`,
    choices: {
      createAll: { label: 'Add the new values', hint: 'Missing values are added to the field' },
      matchExisting: { label: 'Only existing values', hint: 'Unmatched cells import empty' },
      skip: { label: "Don't import this", hint: 'The column is ignored entirely' },
    },
    createAllWithCount: (n: number) => `Add the new values (${n})`,
    untick: 'Untick anything you don’t want',
    more: (n: number) => ` +${n} more`,
  },

  /** Why a metadata sheet could not be used (parseMetaSheet). */
  meta: {
    empty: 'The metadata sheet is empty.',
    unreadable: 'The metadata sheet could not be read.',
    unexpectedShape: 'The metadata sheet has an unexpected shape.',
    noVersion: 'The metadata sheet has no format version.',
    newerVersion: (version: number) =>
      `This file was exported by a newer version of GlobeExpenses (format ${version}).`,
    missingConfig: 'The metadata sheet is missing its field configuration.',
  },

  disabledFields: {
    title: 'Some hidden fields still have data',
    body: (n: number) =>
      plural('en', n, {
        one: 'This field is switched off for this space, but it still holds values on some transactions.',
        other: 'These fields are switched off for this space, but they still hold values on some transactions.',
      }),
    includeHint:
      'Including them adds a column per field. Re-importing the file restores both the values and their switched-off state.',
    includeAnyway: 'Include them anyway',
    exportWithout: 'Export without them',
  },
}
