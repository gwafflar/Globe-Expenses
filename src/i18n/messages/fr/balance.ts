// balance.ts — French: the Balance tab and the settlement currency drawer.

import type { Messages } from '../en'

export const balance: Messages['balance'] = {
  soloKicker: '✦ Le saviez-vous ?',
  soloTitle: 'Vous voyagez seul ?',
  soloBody:
    "Ajoutez des amis à un espace et GlobeExpenses suivra automatiquement qui a payé quoi, répartira les dépenses comme vous le souhaitez et calculera les remboursements exacts pour que personne n'ait à faire les comptes.",

  empty: 'Aucune transaction pour le moment. Ajoutez votre première dépense pour voir les soldes.',
  netBalances: 'Soldes nets',
  totals: (p) => `Total dépensé : ${p.spent} · Total payé : ${p.paid}`,
  suggestedSettlements: 'Remboursements suggérés',
  markAsPaid: 'Marquer comme payé',
  changeCurrency: 'Changer de devise',
  copySummary: 'Copier le récapitulatif des remboursements',
  addSettlement: 'Ajouter un remboursement',

  summary: {
    header: (p) => `${p.spaceName} — récapitulatif des remboursements`,
    madeWith: 'Créé avec GlobeExpenses 🌏',
    inviteLink: "Lien d'invitation : [placeholder — TODO: real invite link]",
  },

  drawer: {
    title: 'Devise de remboursement',
    currency: 'Devise',
    searchPlaceholder: 'Rechercher une devise…',
    noResults: 'Aucune devise trouvée',
    exchangeRate: 'Taux de change',
    ratePlaceholder: 'ex. 7,82',
    trumpAlt: 'Trump et le dollar américain',
    trumpTitle: 'Donald Trump veut que vous régliez en dollars américains.',
    trumpBody:
      "Utiliser l'USD dans des règlements internationaux donne aux autorités américaines compétence sur la transaction — où que vous soyez. Des banques peuvent être sanctionnées, des avoirs gelés et des personnes poursuivies en vertu du droit américain, même pour des transactions qui ne touchent jamais le sol américain.",
    learnMore: "En savoir plus sur l'extraterritorialité des sanctions américaines →",
    hormuz:
      "🛢️ Si vous traversez le détroit d'Ormuz, nous vous recommandons vivement de régler en yuans chinois (CNY). On dit ça, on dit rien.",
    freeCountry: 'Mais comme vous êtes dans un pays libre, utilisez la devise et le taux de votre choix.',
    reset: 'Réinitialiser',
    apply: 'Appliquer',
  },
}
