// profile.tsx (FR) — see messages/en/profile.tsx.

import type { Messages } from '../en'

export const profile: Messages['profile'] = {
  allSpaces: 'Tous les espaces',
  title: 'Profil',
  noName: 'Aucun nom défini',
  saved: 'Enregistré.',
  saveFailed: "Échec de l'enregistrement. Veuillez réessayer.",

  sections: {
    identity: 'Identité',
    security: 'Sécurité',
    preferences: 'Préférences',
    friends: 'Amis',
  },

  identity: {
    displayName: "Nom d'affichage",
    displayNamePlaceholder: 'Votre nom',
    username: 'Identifiant',
    usernamePlaceholder: 'votreidentifiant',
    usernameHint: 'Sert à trouver et ajouter des amis. Doit être unique.',
    tagTaken: (p) => `@${p.tag} est déjà pris.`,
    tagJustTaken: (p) => `@${p.tag} vient d'être pris. Essayez un autre identifiant.`,
  },

  security: {
    email: 'E-mail',
    password: 'Mot de passe',
    sendReset: 'Envoyer un e-mail de réinitialisation du mot de passe',
    resetSent: (p) => `E-mail de réinitialisation envoyé à ${p.email}. Consultez votre boîte de réception.`,
    resetFailed: "Échec de l'envoi de l'e-mail de réinitialisation. Veuillez réessayer.",
  },

  preferences: {
    mainCurrency: 'Devise principale préférée des espaces',
    mainCurrencyHint: 'Utilisée par défaut lorsque vous créez un nouvel espace. Modifiable pour chaque espace.',
    darkMode: 'Mode sombre',
    themePreference: 'Préférence de thème',
  },

  friends: {
    creatingLink: 'Création du lien…',
    generateLink: "Générer un lien d'invitation",
    linkHint: "Toute personne qui ouvre ce lien peut vous ajouter comme ami.",
    findByUsername: 'Rechercher par @identifiant',
    searchPlaceholder: 'identifiant',
    searching: 'Recherche…',
    alreadyFriends: 'Amis',
    sent: 'Envoyée',
    add: 'Ajouter',
    noUsersFound: (p) => `Aucun utilisateur trouvé pour @${p.query}`,
    spaceInvitations: (n) => `Invitations à des espaces (${n})`,
    unknownSpace: 'Espace inconnu',
    fromSender: (p) => `de ${p.name}${p.nametag}`,
    join: 'Rejoindre',
    decline: 'Refuser',
    friendRequests: (n) => `Demandes d'ami (${n})`,
    accept: 'Accepter',
    yourFriends: (n) => `Vos amis (${n})`,
    noFriends: "Pas encore d'amis. Recherchez un @identifiant ci-dessus pour ajouter quelqu'un.",
  },

  signOut: {
    button: 'Se déconnecter',
    title: 'Se déconnecter ?',
    description: () => (
      <>
        Vous serez déconnecté de GlobeExpenses sur cet appareil. Toutes les données en cache
        local seront effacées.
        <br /><br />
        <strong>Remarque :</strong> il n'est actuellement pas possible de réinitialiser votre mot
        de passe depuis l'application. Si vous perdez l'accès à votre compte, contactez
        directement le développeur.
      </>
    ),
    confirm: 'Se déconnecter',
  },
}
