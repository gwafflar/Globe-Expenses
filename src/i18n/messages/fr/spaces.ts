// spaces.ts — French: spaces list, space creation, presets, space detail page and tab shell.

import type { Messages } from '../en'
import { plural } from '../../plural'

export const spaces: Messages['spaces'] = {
  profile: 'Profil',

  list: {
    title: 'Vos espaces',
    subtitle: 'Sélectionnez un voyage pour consulter et gérer ses dépenses.',
    newSpace: 'Nouvel espace',
    loading: 'Chargement de vos espaces…',
    loadError: 'Impossible de charger vos espaces.',
    loadErrorFallback: 'Impossible de charger les espaces.',
    empty: 'Aucun espace pour le moment.',
    emptyHint: 'Créez votre premier voyage pour commencer à suivre les dépenses partagées avec vos compagnons.',
    createFirst: '🚀 Créer votre premier voyage',
    allArchived: 'Tous vos espaces sont archivés.',
    archived: (n) => `Archivés (${n})`,
  },

  presets: {
    travel: {
      title: 'Voyage',
      description: "Voyage à l'étranger, seul ou entre amis",
      chips: ['Pays', 'Villes', 'Multidevise', 'Portefeuille espèces'],
      namePlaceholder: 'Japon 2026',
    },
    solo: {
      title: 'Budget perso',
      description: 'Suivez vos propres dépenses',
      chips: ['Catégories', 'Moyens de paiement'],
      namePlaceholder: 'Mon budget',
    },
    group: {
      title: 'Groupe',
      description: 'Colocataires, collègues, couple',
      chips: ['Catégories', 'Répartition et soldes'],
      namePlaceholder: 'Colocation',
    },
    custom: {
      title: 'Personnalisé',
      description: 'Partir de zéro',
      chips: ['Choisissez vos champs'],
      namePlaceholder: 'Mon espace',
    },
  },

  presetPicker: {
    title: 'Nouvel espace',
    subtitle: 'Choisissez un point de départ. Vous pourrez tout modifier plus tard.',
  },

  create: {
    newSpace: 'Nouvel espace',
    name: 'Nom',
    spaceEmoji: "Emoji de l'espace",
    mainCurrency: 'Devise principale',
    mainCurrencyWarning: 'Tout est converti dans cette devise. Elle ne pourra plus être modifiée ensuite.',
    otherCurrencies: 'Autres devises',
    optionalSuffix: '— facultatif',
    setTripDates: 'Définir les dates du voyage',
    customizeFields: 'Personnaliser les champs',
    customizeFieldsSummary: 'Configurez-les maintenant, ou plus tard',
    createSpace: "Créer l'espace",
    unknownMember: 'Inconnu',
    ready: (p) => `${p.name} est prêt`,
    readyHint: "Invitez des personnes maintenant, ou ouvrez l'espace et faites-le plus tard.",
    linkCopied: 'Lien copié',
    copyInviteLink: "Copier le lien d'invitation",
    openSpace: "Ouvrir l'espace",
  },

  detail: {
    savedLocally: '⏳ Enregistré localement — sera synchronisé avec le serveur',
    transactionSaved: '✅ Transaction enregistrée',
    unarchivedDone: 'Cet espace a été désarchivé et figure de nouveau dans votre liste active.',
    archived: 'Cet espace est archivé.',
    unarchiving: 'Désarchivage…',
    unarchive: 'Désarchiver',
    rateRepair: (p) =>
      plural('fr', p.count, {
        one: `⚠️ ${p.count} taux de change corrigé (${p.codes}) : il était enregistré à l'envers à cause d'un bug depuis résolu. Les transactions passées ne sont pas affectées.`,
        other: `⚠️ ${p.count} taux de change corrigés (${p.codes}) : ils étaient enregistrés à l'envers à cause d'un bug depuis résolu. Les transactions passées ne sont pas affectées.`,
      }),
    dismiss: 'Fermer',
    missingId: "Identifiant d'espace manquant.",
    offlineMessage: "Vérifiez votre connexion et réessayez — impossible de savoir si cet espace existe tant que le serveur n'a pas répondu.",
    notFoundMessage: "Il a peut-être été supprimé, ou vous n'avez pas l'autorisation de le consulter.",
    loadErrorMessage: 'Impossible de charger cet espace. Veuillez réessayer plus tard.',
    allSpaces: 'Tous les espaces',
    loadingSpace: "Chargement de l'espace…",
    slowHint: "Vous semblez avoir des problèmes de connexion. Si l'espace ne se charge pas, essayez de couper le Wi-Fi et les données mobiles pour utiliser l'application hors ligne.",
    cantConfirm: 'Impossible de vérifier cet espace',
    notFoundTitle: 'Espace introuvable',
    offlineLead: "Vous êtes hors ligne et cet espace n'est pas dans votre cache local.",
    notFoundLead: "Nous n'avons pas trouvé cet espace.",
    backToSpaces: 'Retour aux espaces',
    transactionGone: "Cette transaction n'existe plus.",
    cameraTooltip: "Bientôt en v2 — photographiez un ticket et laissez l'IA remplir la transaction.",
    noSlotTitle: "Associez-vous d'abord à un membre",
    noSlotDescription: "Vous n'êtes encore associé à aucun membre. Indiquez qui vous êtes dans cet espace pour que l'on sache qui a payé les transactions que vous enregistrez.",
    goToMembers: 'Aller aux membres',
    deleteTitle: 'Supprimer cette dépense ?',
    deleteDescription: 'Cette action est irréversible. La dépense sera définitivement supprimée pour tous les membres.',
    pushPrompt: (p) =>
      `${p.author} a ajouté ${p.name} (${p.amount}), qui vous concerne. Être averti la prochaine fois ?`,
    someone: "Quelqu'un",
  },

  tabs: {
    transactions: 'Transactions',
    balance: 'Soldes',
    dashboard: 'Tableau de bord',
    parameters: 'Paramètres',
  },
}
