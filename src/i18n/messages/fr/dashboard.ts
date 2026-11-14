import type { Messages } from '../en'
import { plural } from '../../plural'

export const dashboard: Messages['dashboard'] = {
  range: {
    month: 'Ce mois-ci',
    last30: '30 derniers jours',
    all: 'Depuis le début',
    custom: 'Personnalisé',
  },

  day: {
    // Abbreviated: the "Day by day" date column is only ~8 characters wide.
    today: 'Auj.',
    yesterday: 'Hier',
    days: (n) => plural('fr', n, { one: `${n} jour`, other: `${n} jours` }),
  },

  breakdown: {
    other: (n) =>
      plural('fr', n, { one: `Autres · ${n} valeur`, other: `Autres · ${n} valeurs` }),
    // "Sans …" is gender-neutral ("Sans catégorie", "Sans pays").
    missing: (p) => `Sans ${p.dimension.toLowerCase()}`,
    byDimension: (p) => `Par ${p.dimension.toLowerCase()}`,
    pivotTitle: (p) => `${p.primary} × ${p.secondary.toLowerCase()}`,
    noData: 'Aucune donnée',
    showTransactionsFor: (p) => `Afficher les transactions pour ${p.label}`,
    expand: (p) => `Déplier ${p.label}`,
    collapse: (p) => `Replier ${p.label}`,
  },

  controls: {
    allPill: '👤 Tous',
    youPill: '👤 Vous',
    whoseSpending: 'Dépenses de qui',
    from: 'Du',
    to: 'Au',
    apply: 'Appliquer',
    showSpendingFor: 'Afficher les dépenses de',
    allMembers: 'Tous les membres',
    you: 'Vous',
    unclaimed: 'non associé',
  },

  builder: {
    editTitle: 'Modifier la carte',
    addTitle: 'Ajouter une carte',
    description: "Ventilez vos dépenses selon n'importe quel champ suivi par cet espace.",
    noFields:
      "Cet espace n'a encore aucun champ selon lequel ventiler. Activez un champ intégré ou ajoutez un champ personnalisé dans Paramètres.",
    firstDimension: 'Première dimension',
    secondDimension: 'Deuxième dimension (facultative)',
    swapOrder: "⇄ Inverser l'ordre",
    duplicateHint: 'Déjà sur votre tableau de bord',
    swapUnavailable: "Impossible d'inverser : déjà sur votre tableau de bord.",
    duplicateExplain:
      "Déjà sur votre tableau de bord. Choisissez une autre combinaison — ou inversez l'ordre, ce qui donne une autre carte.",
    title: 'Titre',
    preview: 'Aperçu',
    addCard: 'Ajouter la carte',
  },

  tab: {
    totalSpent: 'Total dépensé',
    yourShare: 'Votre part',
    memberShare: (p) => `Part de ${p.name}`,
    txCountInRange: (p) =>
      plural('fr', p.count, {
        one: `${p.count} transaction · ${p.range}`,
        other: `${p.count} transactions · ${p.range}`,
      }),
    avgPerDay: 'Moy./jour',
    you: 'Vous',
    nameYou: (p) => `${p.name} (vous)`,
    paidColon: (p) => `payé : ${p.amount}`,
    transactions: 'Transactions',

    labelValue: (p) => `${p.label} : ${p.value}`,

    spendingOverTime: 'Dépenses dans le temps',
    notEnoughData: 'Pas assez de données',
    txCountShort: (n) => plural('fr', n, { one: `${n} transaction`, other: `${n} transactions` }),
    uncategorized: 'Sans catégorie',
    showCategory: 'Afficher cette catégorie',
    hideCategoryFromChart: 'Masquer toute la catégorie du graphique',
    hideCategoryFromTheChart: 'Masquer toute la catégorie du graphique',
    showPill: '👁️ Afficher',
    hideAllPill: '👁️‍🗨️ Tout masquer',
    editTransaction: 'Modifier cette transaction',
    showTransaction: 'Afficher cette transaction',
    hideTransaction: 'Masquer cette transaction',
    hidden: 'Masqués :',

    dayByDay: 'Jour par jour',
    dayCount: (n) => plural('fr', n, { one: `${n} jour`, other: `${n} jours` }),
    noExpensesInRange: 'Aucune dépense sur cette période',
    noExpenses: 'Aucune dépense',
    showFewerDays: 'Afficher moins de jours',
    showAllDays: (n) => `Afficher les ${n} jours`,

    moveCardUp: 'Monter la carte',
    moveCardDown: 'Descendre la carte',
    editCard: 'Modifier la carte',
    deleteCard: 'Supprimer la carte',
    emptyCardsInvite: (p) =>
      `Ventilez vos dépenses par ${p.dimension.toLowerCase()} — ou par n'importe quel autre champ.`,
    addACard: '+ Ajouter une carte',
    addCard: '+ Ajouter une carte',
    editCards: 'Modifier les cartes',

    perPerson: 'Par personne',
    youSuffix: '(vous)',
    paidAmount: (p) => `payé ${p.amount}`,

    walletBalances: 'Soldes des portefeuilles',
    walletCount: (n) => plural('fr', n, { one: `${n} portefeuille`, other: `${n} portefeuilles` }),
    noWalletsYet: 'Aucun portefeuille pour le moment',
    currencyRemaining: (p) => `${p.currency} restants`,
    totalDeposited: 'Total déposé : ',
    totalSpentColon: 'Total dépensé : ',
    adjustments: 'Ajustements : ',
    sinceLastTopup: 'Depuis le dernier retrait',
    sinceLastTopupNote: 'Inclut toutes les transactions depuis la fin de journée du dernier retrait',
    date: 'Date : ',
    amount: 'Montant : ',
    balanceAfter: 'Solde après : ',
    spentSince: 'Dépensé depuis : ',
    estRemaining: 'Reste estimé : ',
    notTheAmount: "Ce n'est pas le montant que vous avez ?",
    reconcile: 'Rapprocher avec le montant actuel',
    noWalletEvents: 'Aucun mouvement de portefeuille enregistré pour le moment.',
    history: 'Historique',
    allWalletEvents: 'Tous les mouvements de portefeuille',
    feesAmount: (p) => `frais : ${p.amount}`,
    spentBetween: (p) => `Dépensé entre ${p.from} et ${p.to} :`,
    recordWithdrawalHint:
      "Enregistrez un retrait pour commencer à suivre le solde d'un moyen de paiement.",
    recordWithdrawal: '+ Enregistrer un retrait',
    walletPrivacyNote:
      'Seuls vos soldes de portefeuille sont affichés. Les données de retrait sont stockées avec les transactions partagées. Les transferts entre participants ne sont pas pris en compte dans le calcul du portefeuille.',

    currencies: 'Devises',
    convertedNote: 'Montants convertis au taux enregistré pour chaque transaction',
  },
}
