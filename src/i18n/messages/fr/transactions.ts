// transactions.ts (FR) — see messages/en/transactions.ts.

import type { Messages } from '../en'
import { plural } from '../../plural'

export const transactions: Messages['transactions'] = {
  types: {
    expense: 'Dépense',
    transfer: 'Transfert',
    withdrawal: 'Retrait',
    adjustment: 'Ajustement',
  },

  load: {
    missingSpace: "Identifiant d'espace manquant.",
    failed: (p) => `Impossible de charger les transactions. (${p.code} : ${p.message})`,
  },

  filters: {
    dimensions: {
      type: 'Type',
      category: 'Catégorie',
      currency: 'Devise',
      country: 'Pays',
      city: 'Ville',
      paymentMethod: 'Paiement',
      paidBy: 'Payé par',
      beneficiaries: 'Pour',
    },
    undefinedOption: 'Non défini',
    yes: 'Oui',
    no: 'Non',
    any: 'Tous',
    searchPlaceholder: 'Rechercher un nom, une note ou un montant…',
    clear: 'Effacer',
    clearAll: 'Tout effacer',
    spendingOnly: 'Dépenses uniquement',
    removeDateRange: 'Retirer le filtre de période',
    removeSpendingOnly: 'Retirer le filtre « dépenses uniquement »',
    removeFilter: (p) => `Retirer le filtre ${p.value}`,
    qualified: (p) => `${p.dimension} : ${p.value}`,
  },

  split: {
    notSet: 'Non défini',
    you: 'Vous',
    youPlusOthers: (n) =>
      plural('fr', n, { one: `Vous + ${n} autre`, other: `Vous + ${n} autres` }),
    people: (n) => plural('fr', n, { one: `${n} personne`, other: `${n} personnes` }),
    modes: {
      equal: 'Équitable',
      custom: 'Personnalisé',
    },
    withMode: (p) => `${p.names} · ${p.mode}`,
    incomplete: 'Répartition incomplète',
    unassigned: (p) => `${p.amount} non attribué`,
    overTotal: (p) => `${p.amount} au-delà du total`,
    totalChanged: 'Le total a changé. Vérifiez et ajustez les montants manuellement.',
    absorb: (p) => `Ajouter ${p.amount} à ${p.name}`,
    removeMember: (p) => `Retirer ${p.name}`,
    addMember: 'Ajouter un membre',
    remaining: 'Reste',
  },

  formula: {
    insert: (p) => `Insérer ${p.op}`,
    placeholder: 'ex. 2*2,5 + 1,5',
    inputLabel: 'Saisie de la formule',
    invalid: 'Formule invalide',
  },

  reconcile: {
    title: (p) => `Rapprochement — ${p.method} (${p.currency})`,
    computedRemaining: 'Solde calculé',
    actualQuestion: 'Combien avez-vous réellement ?',
    difference: 'Écart',
    more: '(vous avez plus que prévu)',
    less: '(vous avez moins que prévu)',
    balanced: 'Équilibré — aucun ajustement nécessaire',
    howToRecord: "Comment enregistrer l'écart ?",
    createExpense: 'Créer une dépense',
    createExpenseHint: 'Compte dans les statistiques de dépenses (catégories, totaux)',
    balanceOnly: 'Ajuster le solde uniquement',
    balanceOnlyHint: 'Corrige le solde du portefeuille sans modifier les statistiques de dépenses',
    surplusName: (p) => `Rapprochement (excédent) — ${p.method}`,
    shortfallName: (p) => `Rapprochement (manque) — ${p.method}`,
  },
}
