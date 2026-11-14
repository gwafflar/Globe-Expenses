// parameters.tsx (FR) — see messages/en/parameters.tsx. The
// `Messages['parameters']` annotation makes TypeScript reject a missing or
// extra key, or a different function signature.

import type { Messages } from '../en'
import { plural } from '../../plural'

export const parameters: Messages['parameters'] = {
  sections: {
    space: 'Espace',
    members: 'Membres',
    fields: 'Champs',
    currencies: 'Devises',
    exchangeRates: 'Taux de change',
    categories: 'Catégories',
    paymentMethods: 'Moyens de paiement',
    countries: 'Pays',
    cities: 'Villes',
    feedback: 'Votre avis',
    manageSpace: "Gérer l'espace",
  },

  identity: {
    emoji: 'Emoji',
    emojiAria: "Emoji de l'espace",
    emojiHint: 'Touchez 🌐',
    name: 'Nom',
    namePlaceholder: "Nom de l'espace",
  },

  currencies: {
    mainCurrency: 'Devise principale',
    lockedBadge: 'définie à la création — non modifiable',
    pickerLabel: 'Devises : ',
    noneSelected: 'Aucune devise sélectionnée',
    searchPlaceholder: 'Rechercher une devise…',
    noMatch: 'Aucune devise ne correspond.',
    mainTag: '(principale)',
  },

  rates: {
    hint: 'Taux par défaut des nouvelles transactions. Modifier un taux ne concerne que les transactions futures.',
  },

  countries: {
    pickerLabel: 'Pays : ',
    noneSelected: 'Aucun pays sélectionné',
    searchPlaceholder: 'Rechercher un pays…',
    noMatch: 'Aucun pays ne correspond.',
  },

  lists: {
    emojiAria: 'Emoji',
    newItemEmojiAria: "Emoji du nouvel élément",
    deleteItem: (label) => `Supprimer ${label}`,
    categoryPlaceholder: 'Nom de la catégorie…',
    paymentMethodPlaceholder: 'Moyen de paiement…',
    cityPlaceholder: 'Nom de la ville…',
  },

  members: {
    soloTitle: 'Membres : vous',
    soloOnly: 'Vous êtes le seul membre de cet espace.',
    didYouKnow: 'ℹ️ Le saviez-vous ?',
    soloHint: "Vous pouvez ajouter d'autres personnes à cet espace et partager vos transactions avec elles.",
    addMember: 'Ajouter un membre',
    noSlot: "Vous n'êtes encore associé à aucun membre — indiquez ci-dessous qui vous êtes.",
    you: 'Vous',
    unclaimed: 'Non associé',
    linkedAccount: 'Compte lié',
    creator: 'créateur',
    renameAria: (name) => `Renommer ${name}`,
    thisIsMe: "🎯 C'est moi",
    thisIsNotMe: "❌ Ce n'est pas moi",
    othersCanRename: '🔓 Renommable par les autres',
    renameLocked: '🔒 Renommage verrouillé',
    mergeDuplicates: 'Fusionner des membres en double',
  },

  addMember: {
    title: 'Ajouter un membre',
    tabs: {
      name: 'Par nom',
      friend: 'Ami',
      username: '@Identifiant',
      link: 'Lien',
    },
    byNameHint:
      "Ajoutez une personne qui n'a pas de compte. Elle ne pourra pas se connecter, mais vous pourrez suivre sa part des dépenses.",
    namePlaceholder: 'Son nom…',
    loadingFriends: 'Chargement des amis…',
    noFriends:
      "Pas encore d'amis. Utilisez l'onglet @Identifiant pour trouver des personnes, ou partagez le lien d'invitation.",
    allFriendsIn: 'Tous vos amis sont déjà dans cet espace.',
    invited: 'Invité',
    invite: 'Inviter',
    usernameHint:
      "Recherchez par @identifiant. Une invitation sera envoyée — la personne doit l'accepter pour rejoindre l'espace.",
    usernamePlaceholder: '@identifiant…',
    inSpace: 'Déjà membre',
    noUsers: 'Aucun utilisateur trouvé.',
    linkHint:
      "Partagez ce lien avec qui vous voulez. La personne pourra rejoindre l'espace et sera ajoutée à vos amis.",
    creatingLink: 'Création du lien…',
    generateLink: "Générer un lien d'invitation",
    linkAnyone: 'Toute personne disposant de ce lien peut rejoindre cet espace.',
  },

  merge: {
    doneTitle: '✅ Membres fusionnés',
    confirmTitle: 'Confirmer la fusion',
    doneDeleted: (p) => <>Membre {p.name} supprimé. Toutes les transactions ont été mises à jour.</>,
    doneKept: (p) => <>Les dépenses sont désormais attribuées à {p.name}.</>,
    selectHint:
      'Sélectionnez deux membres qui représentent la même personne. Leurs dépenses seront regroupées.',
    confirmHint:
      "Choisissez le membre à conserver. L'autre sera supprimé et toutes ses dépenses seront transférées au membre conservé.",
    keep: '← Conserver',
    delete: '← Supprimer',
    cannotUndo: '⚠️ Cette action est irréversible.',
    warning: (p) =>
      `"${p.deleted}" sera définitivement supprimé. Toutes ses transactions seront transférées à "${p.kept}".`,
    merging: 'Fusion…',
    mergeAndDelete: 'Fusionner et supprimer',
  },

  unlink: {
    title: 'Qui êtes-vous dans cet espace ?',
    hint: 'Choisissez un membre pour continuer. Vous pouvez vous choisir vous-même ou une nouvelle personne.',
    currentlyYou: '(vous actuellement)',
    thisIsMe: "C'est moi",
    createNew: '+ Créer un nouveau membre',
    namePlaceholder: 'Nom…',
  },

  manage: {
    archiving: 'Archivage…',
    unarchiving: 'Désarchivage…',
    archived: 'Archivé !',
    unarchived: 'Désarchivé !',
    archive: 'Archiver cet espace',
    unarchive: 'Désarchiver cet espace',
    archiveHintSolo:
      "Déplacer cet espace dans les archives. Vous pourrez toujours l'ouvrir et ajouter ou modifier des transactions.",
    archiveHintMulti:
      "Déplacer cet espace dans les archives. Vous resterez membre de cet espace et pourrez toujours l'ouvrir et ajouter ou modifier des transactions. Cela n'a aucun effet pour les autres participants.",
    archivedBanner: 'Cet espace est maintenant archivé. Il apparaîtra dans votre section "Archivés".',
    unarchivedBanner: 'Cet espace a été désarchivé et figure de nouveau dans votre liste active.',
    deleteSpace: 'Supprimer cet espace',
    leaveSpace: 'Quitter cet espace',
    deleteExplain:
      'Vous êtes le seul utilisateur. La suppression effacera définitivement cet espace et toutes ses transactions.',
    leaveExplain:
      "Vous serez retiré de l'espace. Les autres membres y garderont accès. Vos transactions passées seront conservées.",
    deleteTitle: 'Supprimer cet espace ?',
    leaveTitle: 'Quitter cet espace ?',
    deleteDescription:
      "L'espace et toutes ses transactions seront définitivement supprimés. Cette action est irréversible.",
    leaveDescription:
      "Vous n'aurez plus accès à cet espace. Votre historique de dépenses restera disponible pour les autres membres.",
    deleting: 'Suppression…',
    leaving: 'Départ en cours…',
    leave: 'Quitter',
  },

  fields: {
    builtIn: {
      country: { label: 'Pays', hint: 'Sélecteur avec drapeaux' },
      city: { label: 'Ville', hint: 'Rempli automatiquement à partir de vos saisies' },
      category: { label: 'Catégorie', hint: 'Utilisée pour la ventilation du tableau de bord' },
      paymentMethod: { label: 'Moyen de paiement', hint: "Requis pour le portefeuille d'espèces" },
      notes: { label: 'Notes', hint: 'Texte libre sur chaque transaction' },
    },
    features: {
      wallets: { label: "Portefeuille d'espèces", hint: 'Retraits, ajustements, suivi du solde' },
      multiCurrency: {
        label: 'Plusieurs devises',
        hint: "S'active automatiquement la première fois que vous utilisez une autre devise",
      },
    },
    types: {
      select: 'Choix',
      text: 'Texte',
      boolean: 'Oui-non',
    },
    untitled: 'Champ sans titre',
    enableField: (label) => (label ? `Activer ${label}` : 'Activer le champ'),
    emojiAria: 'Emoji du champ',
    namePlaceholder: 'Nom du champ',
    labelAria: 'Libellé du champ',
    type: 'Type',
    choices: 'Choix',
    removeChoice: (label) => `Retirer ${label}`,
    addChoicePlaceholder: 'Ajouter un choix…',
    addChoiceAria: 'Ajouter un choix',
    choicesHint: 'Renommer un choix le met à jour partout, y compris dans les transactions passées.',
    textHint: 'Texte libre. Pris en compte par la recherche, mais ni additionné ni affiché dans les graphiques.',
    booleanHint: 'Un interrupteur oui/non. Vous pouvez filtrer dessus et totaliser les montants marqués oui.',
    deleteField: 'Supprimer ce champ',
    deleteTitle: (label) => `Supprimer "${label}" ?`,
    deleteDescription:
      "Les valeurs déjà saisies dans ce champ ne seront plus visibles. Vous pouvez plutôt utiliser l'interrupteur ci-dessus pour masquer le champ sans rien perdre.",
    preset: 'Modèle',
    modified: '(modifié)',
    differs: 'Vos réglages diffèrent du modèle',
    matches: 'Conforme au modèle',
    reset: 'Réinitialiser',
    resetTitle: (title) => `Revenir au modèle ${title} ?`,
    resetDescription: 'Vos champs personnalisés, catégories et membres ne sont pas modifiés.',
    on: 'activé',
    off: 'désactivé',
    keepMine: 'Garder les miens',
    resetToggles: 'Réinitialiser les options',
    onEachTransaction: 'Champs de chaque transaction',
    walletNeedsPm: "Le portefeuille d'espèces a besoin de ce champ.",
    offHint: "Désactiver un champ le masque. Rien de ce que vous avez déjà saisi n'est supprimé.",
    featuresTitle: 'Fonctionnalités',
    foreignCurrencyTx: (n) =>
      plural('fr', n, {
        one: `${n} transaction utilise une autre devise.`,
        other: `${n} transactions utilisent une autre devise.`,
      }),
    customTitle: 'Champs personnalisés',
    customEmpty: 'Ajoutez votre propre champ — un projet, une boutique, un indicateur "remboursable ?".',
  },

  pickers: {
    search: 'Rechercher…',
    inCurrency: (p) => (
      <>
        en {p.currency} · {p.other}
      </>
    ),
    otherCurrency: '+ autre devise',
    enterValue: (label) => `Saisir : ${label.toLowerCase()}…`,
    other: 'Autre',
    addNew: '+ Ajouter…',
    savedAsOther: 'Enregistré comme "Autre". Utilisez "Ajouter…" pour saisir un nom précis.',
  },
}
