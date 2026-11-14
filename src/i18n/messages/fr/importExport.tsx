// importExport.tsx (fr) — see messages/en/importExport.tsx.

import type { Messages } from '../en'
import { plural } from '../../plural'

export const importExport: Messages['importExport'] = {
  coreFields: {
    date: 'Date',
    name: 'Description',
    totalAmount: 'Montant',
    currency: 'Devise',
    exchangeRate: 'Taux de change',
  },
  builtInFields: {
    country: 'Pays',
    city: 'Ville',
    category: 'Catégorie',
    paymentMethod: 'Moyen de paiement',
    notes: 'Notes',
  },
  transactionCount: (n) =>
    plural('fr', n, { one: `${n} transaction`, other: `${n} transactions` }),
  unnamedTransaction: '(sans nom)',
  import: 'Importer',

  dialog: {
    title: 'Importer depuis un fichier xlsx',
    steps: {
      upload: 'Étape 1 — Fichier',
      confirm: 'Étape 2 sur 2 — Confirmation',
      mapping: 'Étape 2 sur 4 — Correspondance des membres',
      preview: 'Étape 3 sur 4 — Aperçu des données',
      columns: 'Étape 2 — Correspondance des colonnes',
      fields: 'Étape 3 — Nouveaux champs',
      values: 'Dernière étape — Nouvelles valeurs',
      result: 'Terminé',
    },
    metaFallback: (reason) => `${reason} Les valeurs seront associées par leur nom.`,
    importFailed: "L'importation a échoué.",
  },

  upload: {
    formatNotice:
      "Un export GlobeExpenses s'importe en un geste. Tout autre tableur fonctionne aussi — il vous sera demandé d'associer ses colonnes aux champs.",
    wrongExtension: 'Veuillez choisir un fichier .xlsx.',
    readFailed: 'Impossible de lire le fichier.',
    dropzone: 'Cliquez pour parcourir ou glissez-déposez',
    dropzoneHint: 'Fichier .xlsx GlobeExpenses',
    parsing: 'Lecture du fichier…',
  },

  mapping: {
    intro: (p) => (
      <>
        <strong>{p.rows}</strong>{' '}
        {plural('fr', p.rows, { one: 'transaction trouvée', other: 'transactions trouvées' })} sur{' '}
        <strong>{p.slots}</strong>{' '}
        {plural('fr', p.slots, { one: 'emplacement de membre actif', other: 'emplacements de membre actifs' })}.
        Associez chaque membre du fichier à un membre de l'espace ci-dessous.
      </>
    ),
    countMismatch: (p) =>
      `Le fichier contient ${p.sheet} ${plural('fr', p.sheet, { one: 'emplacement de membre', other: 'emplacements de membre' })} mais cet espace compte ${p.space} ${plural('fr', p.space, { one: 'membre', other: 'membres' })}. Vérifiez attentivement les correspondances.`,
    duplicates: 'Deux membres du fichier sont associés à la même personne. Corrigez cela avant de continuer.',
    skippedWarning: 'Les transactions impliquant des membres ignorés ne seront pas importées.',
    slotFallback: (n) => `Emplacement ${n}`,
    skipOption: '— Ignorer les transactions de ce membre —',
    fixDuplicates: 'Corrigez les correspondances en double avant de continuer.',
    foreignSpace: (p) => (
      <>
        Ce fichier a été exporté depuis <strong>{p.name}</strong>, un autre espace. Ses membres et
        ses valeurs de champs n'ont pas d'identifiants correspondants ici : il vous sera demandé de
        les associer ci-dessous.
      </>
    ),
  },

  result: {
    committed: (p) => `${p.committed} / ${p.total} transactions enregistrées`,
    summary: (p) => {
      const parts: string[] = []
      if (p.imported > 0) {
        parts.push(plural('fr', p.imported, {
          one: `${p.imported} nouvelle transaction importée`,
          other: `${p.imported} nouvelles transactions importées`,
        }))
      }
      if (p.updated > 0) {
        parts.push(plural('fr', p.updated, {
          one: `${p.updated} transaction mise à jour`,
          other: `${p.updated} transactions mises à jour`,
        }))
      }
      return parts.length > 0 ? parts.join(', ') : 'Aucune transaction importée'
    },
    skippedRows: (n) =>
      plural('fr', n, { one: `${n} ligne ignorée (vide)`, other: `${n} lignes ignorées (vides)` }),
    rowsWithErrors: (n) =>
      plural('fr', n, { one: `${n} ligne contenait des erreurs`, other: `${n} lignes contenaient des erreurs` }),
    autoUpdate: 'La liste des transactions se met à jour automatiquement.',
    costSkipped: (p) =>
      `Ligne ${p.row} (${p.name}) : emplacement ${p.slot} non associé — coût ignoré`,
    paidSkipped: (p) =>
      `Ligne ${p.row} (${p.name}) : emplacement ${p.slot} non associé — paiement ignoré`,
  },

  confirm: {
    sameSpace:
      "Ce fichier est un export GlobeExpenses de cet espace. Tout est associé automatiquement — aucune correspondance à faire.",
    space: 'Espace',
    transactions: 'Transactions',
    members: 'Membres',
    customFields: 'Champs personnalisés',
    exported: 'Exporté le',
    renamed: (p) =>
      `L'espace s'appelait « ${p.name} » lors de l'export de ce fichier. C'est le même espace, l'importation n'est donc pas affectée.`,
    inPlace: "Les lignes provenant de cet espace sont mises à jour sur place au lieu d'être dupliquées.",
  },

  preview: {
    countries: 'Pays',
    cities: 'Villes',
    categories: 'Catégories',
    paymentMethods: 'Moyens de paiement',
    summary: (p) =>
      [
        plural('fr', p.rows, { one: `${p.rows} transaction`, other: `${p.rows} transactions` }),
        `${p.countries} pays`,
        plural('fr', p.cities, { one: `${p.cities} ville`, other: `${p.cities} villes` }),
        plural('fr', p.categories, { one: `${p.categories} catégorie`, other: `${p.categories} catégories` }),
        plural('fr', p.paymentMethods, {
          one: `${p.paymentMethods} moyen de paiement`,
          other: `${p.paymentMethods} moyens de paiement`,
        }),
      ].join(' · '),
    allMatch: "Toutes les valeurs correspondent à la configuration de l'espace.",
    someUnmatched:
      "Certaines valeurs ne correspondent pas à la configuration de l'espace. Elles seront importées telles quelles.",
    noValues: 'Aucune valeur trouvée.',
  },

  columns: {
    intro: (p) => (
      <>
        <strong>{p.rows}</strong> {plural('fr', p.rows, { one: 'ligne', other: 'lignes' })} et{' '}
        <strong>{p.columns}</strong> {plural('fr', p.columns, { one: 'colonne', other: 'colonnes' })}{' '}
        trouvées. Les colonnes reconnues ont été préremplies — vérifiez-les et corrigez ce qui ne va pas.
      </>
    ),
    stats: (p) =>
      `${plural('fr', p.count, { one: `${p.count} valeur`, other: `${p.count} valeurs` })}${p.examples ? ` · ex. ${p.examples}` : ''}`,
    dontImport: '— Ne pas importer —',
    groupTransaction: 'Transaction',
    groupFields: 'Champs',
    groupCustomFields: 'Champs personnalisés',
    groupWho: 'Qui',
    groupNew: 'Nouveau',
    cost: (name) => `Coût — ${name}`,
    paid: (name) => `Payé — ${name}`,
    createField: '+ Créer un nouveau champ…',
    columnFallback: (n) => `Colonne ${n}`,
    noReadableSheets: "Le classeur ne contient aucune feuille lisible.",
    amountRequired: 'Une colonne doit être associée au montant.',
    duplicateTarget: (p) => `${p.count} colonnes sont associées au même champ (${p.field}).`,
  },

  newFields: {
    typeLabels: {
      select: 'Liste de choix',
      text: 'Texte libre',
      boolean: 'Oui / non',
    },
    typeHints: {
      select: 'Un ensemble fixe de valeurs pour filtrer et regrouper',
      text: "N'importe quoi — consultable par recherche, mais pas regroupable",
      boolean: 'Un simple indicateur',
    },
    noneToCreate: "Aucun nouveau champ à créer. Revenez en arrière si vous vouliez en ajouter un.",
    intro: 'Ces colonnes deviendront de nouveaux champs dans cet espace. Vérifiez le nom et le type de chacun.',
    limitReached: (n) => `Vous avez atteint la limite de ${n} nouveaux champs par importation.`,
    fromColumn: (header) => `D'après la colonne « ${header} »`,
    dontImport: 'Ne pas importer',
    fieldName: 'Nom du champ',
    type: 'Type',
    suggested: (p) => `Suggestion : ${p.type.toLowerCase()} — ${p.evidence}`,
    optionsCreated: (n) =>
      plural('fr', n, { one: `${n} option sera créée`, other: `${n} options seront créées` }),
    evidence: {
      noValues: 'Aucune valeur pour en déduire le type',
      everyValueIsOneOf: (list) => `Chaque valeur fait partie de : ${list}`,
      distinctInRows: (p) =>
        `${plural('fr', p.distinct, { one: `${p.distinct} valeur distincte`, other: `${p.distinct} valeurs distinctes` })} sur ${plural('fr', p.rows, { one: `${p.rows} ligne`, other: `${p.rows} lignes` })}`,
      overDistinct: (n) => `plus de ${n} valeurs distinctes`,
      mostlyUnique: (reason) => `Valeurs presque toutes uniques — ${reason}`,
    },
  },

  values: {
    nothingToDecide:
      'Toutes les valeurs des colonnes associées existent déjà dans cet espace. Rien à décider.',
    intro: "Certaines colonnes contiennent des valeurs que cet espace n'a pas encore. Choisissez quoi faire pour chacune.",
    matchSummary: (p) =>
      `→ ${p.field} · ${p.matched} ${plural('fr', p.matched, { one: 'correspondance', other: 'correspondances' })}, ${p.unmatched} ${plural('fr', p.unmatched, { one: 'nouvelle', other: 'nouvelles' })}`,
    choices: {
      createAll: { label: 'Ajouter les nouvelles valeurs', hint: 'Les valeurs manquantes sont ajoutées au champ' },
      matchExisting: { label: 'Valeurs existantes uniquement', hint: 'Les cellules sans correspondance sont importées vides' },
      skip: { label: 'Ne pas importer cette colonne', hint: 'La colonne est entièrement ignorée' },
    },
    createAllWithCount: (n) => `Ajouter les nouvelles valeurs (${n})`,
    untick: 'Décochez ce que vous ne voulez pas',
    more: (n) => ` +${n} de plus`,
  },

  meta: {
    empty: 'La feuille de métadonnées est vide.',
    unreadable: "La feuille de métadonnées n'a pas pu être lue.",
    unexpectedShape: 'La feuille de métadonnées a une structure inattendue.',
    noVersion: "La feuille de métadonnées n'indique pas de version de format.",
    newerVersion: (version) =>
      `Ce fichier a été exporté par une version plus récente de GlobeExpenses (format ${version}).`,
    missingConfig: 'La configuration des champs est absente de la feuille de métadonnées.',
  },

  disabledFields: {
    title: 'Des champs masqués contiennent encore des données',
    body: (n) =>
      plural('fr', n, {
        one: 'Ce champ est désactivé pour cet espace, mais il contient encore des valeurs sur certaines transactions.',
        other: 'Ces champs sont désactivés pour cet espace, mais ils contiennent encore des valeurs sur certaines transactions.',
      }),
    includeHint:
      "Les inclure ajoute une colonne par champ. Réimporter le fichier restaure à la fois les valeurs et leur état désactivé.",
    includeAnyway: 'Les inclure quand même',
    exportWithout: 'Exporter sans eux',
  },
}
