// transactionsTab.ts — French: the Transactions tab (list, rows, empty states, actions).

import type { Messages } from '../en'

export const transactionsTab: Messages['transactionsTab'] = {
  sheetsComingSoon: 'Cette fonctionnalité revient bientôt',

  pending: '⏳ En attente',
  pendingTitle: 'Enregistré localement — sera synchronisé une fois de retour en ligne.',
  synced: '✅ Enregistré',

  types: {
    transfer: 'Transfert',
    withdrawal: 'Retrait',
    adjustment: 'Ajustement',
  },
  yourShare: (p) => `votre part : ${p.amount}`,

  detail: {
    category: 'Catégorie',
    payment: 'Paiement',
    fees: 'Frais',
    country: 'Pays',
    city: 'Ville',
    notes: 'Notes :',
    from: 'De',
    to: 'À',
    paidBy: 'Payé par',
    split: 'Répartition',
    you: '(vous)',
  },

  comingSoon: 'Bientôt disponible',
  filter: '🔍 Filtre',
  display: '⊞ Affichage',
  import: 'Importer',
  export: 'Exporter',
  exporting: 'Export…',

  empty: 'Aucune dépense enregistrée pour le moment.',
  emptyHint: 'Touchez + pour ajouter votre première dépense.',
  addFirst: '💸 Ajouter votre première dépense',
  noMatch: 'Aucune transaction ne correspond à vos filtres.',
  clearAll: 'Effacer tous les filtres',
}
