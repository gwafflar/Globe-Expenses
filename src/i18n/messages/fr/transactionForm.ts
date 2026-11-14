// transactionForm.ts (FR) — see messages/en/transactionForm.ts.

import type { Messages } from '../en'

export const transactionForm: Messages['transactionForm'] = {
  profileUnavailable: 'Profil utilisateur indisponible. Déconnectez-vous puis reconnectez-vous.',

  title: {
    new: {
      expense: 'Nouvelle dépense',
      transfer: 'Nouveau transfert',
      withdrawal: 'Nouveau retrait',
      adjustment: 'Nouvel ajustement',
    },
    edit: {
      expense: 'Modifier la dépense',
      transfer: 'Modifier le transfert',
      withdrawal: 'Modifier le retrait',
      adjustment: "Modifier l'ajustement",
    },
  },

  fields: {
    country: 'Pays',
    city: 'Ville',
    category: 'Catégorie',
    paymentMethod: 'Moyen de paiement',
    topUp: 'Moyen crédité',
    from: 'De',
    to: 'À',
    paidBy: 'Payé par',
    split: 'Répartition',
    fees: 'Frais (facultatif)',
    adjustmentMode: "Mode d'ajustement",
    notes: 'Notes',
  },

  amount: {
    default: 'Montant',
    transfer: 'Montant du transfert',
    withdrawal: 'Montant retiré',
  },

  namePlaceholder: {
    expense: "ex. Dîner, Taxi, Nuit d'hôtel",
    transfer: 'ex. Remboursement, Prêt à Bob',
    withdrawal: 'ex. Distributeur Bangkok (facultatif)',
    adjustment: 'ex. Rapprochement espèces (facultatif)',
  },

  select: {
    optional: '— facultatif —',
    required: '— choisir —',
    add: '+ Ajouter…',
    addNew: '+ Nouveau…',
    searchCountry: 'Rechercher un pays…',
    newCategory: 'Nouvelle catégorie…',
    newPaymentMethod: 'Nouveau moyen de paiement…',
    newTopUp: 'Nouveau moyen crédité…',
    you: (p) => `${p.name} (vous)`,
  },

  formula: {
    close: 'Quitter le mode formule',
    open: 'Passer en mode formule',
    enterAbove: 'saisissez la formule ci-dessus',
  },
  rate: {
    unknown: (p) =>
      `⚠️ Aucun taux de change connu pour ${p.from} → ${p.to}. Montant affiché sans conversion — saisissez un taux ci-dessous.`,
    customSuffix: ' (personnalisé)',
    saveAsDefault: 'Enregistrer comme taux par défaut',
    reset: 'Réinitialiser',
  },

  feesHint: 'Déduits du solde du portefeuille (vous avez reçu le montant moins les frais)',

  adjustment: {
    balanceOnly: 'Solde uniquement',
    countAsExpense: 'Compter comme dépense',
    balanceOnlyHint: "Corrige seulement le solde du portefeuille. N'apparaît ni dans les statistiques de dépenses ni dans les catégories.",
    expenseHint: 'Corrige le solde du portefeuille et compte dans les statistiques de dépenses (totaux, catégories, graphiques).',
  },

  solo: {
    prompt: '👥 Partager cette dépense avec vos amis ? Ajoutez-les à cet espace.',
    cta: 'Enregistrer et ajouter des amis →',
  },

  notesPlaceholder: 'Détails supplémentaires…',

  drawer: {
    paidBy: 'Payé par',
    transferTo: 'Transférer à',
    splitBetween: 'Répartir entre',
  },

  errors: {
    dateRequired: 'La date est obligatoire.',
    nameRequired: 'Le nom est obligatoire.',
    invalidAmount: 'Saisissez un montant valide.',
    positiveAmount: 'Saisissez un montant positif.',
    paymentMethodRequired: 'Le moyen de paiement est obligatoire.',
    feesNonNegative: 'Les frais doivent être nuls ou positifs.',
    feesTooHigh: 'Les frais doivent être inférieurs au montant retiré.',
    paidByTotal: 'Les montants « Payé par » doivent égaler le total.',
    splitTotal: 'Les montants de la répartition doivent égaler le total.',
  },
  pleaseFix: (p) => `À corriger : ${p.fields}`,
  errorFields: {
    date: 'Date',
    name: 'Nom',
    amount: 'Montant',
    paidBy: 'Payé par',
    beneficiaries: 'Répartition',
    paymentMethod: 'Moyen de paiement',
    fees: 'Frais',
  },

  discard: {
    titleEdit: 'Abandonner les modifications ?',
    titleNew: 'Abandonner la transaction ?',
    descriptionEdit: 'Les modifications ne sont pas enregistrées et seront perdues.',
    descriptionNew: "La transaction n'est pas enregistrée et sera perdue.",
    confirm: 'Abandonner',
  },

  defaults: {
    settlementName: 'Remboursement',
    topUpName: (p) => `Approvisionnement ${p.method}`,
    adjustmentName: (p) => `Ajustement — ${p.method}`,
    transactionName: 'Transaction',
  },
}
