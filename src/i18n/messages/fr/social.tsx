// social.tsx (FR) — see messages/en/social.tsx.

import type { Messages } from '../en'

export const social: Messages['social'] = {
  invite: {
    allSpaces: 'Tous les espaces',
    goToSpaces: 'Aller à mes espaces',
    notFoundTitle: 'Invitation introuvable',
    notFoundDesc: "Ce lien d'invitation n'est pas valide ou a été supprimé.",
    revokedTitle: "Ce lien n'est plus valide",
    revokedDesc: "La personne qui a partagé ce lien l'a révoqué.",
    expiredTitle: 'Lien expiré',
    expiredDesc: "Ce lien d'invitation a expiré. Demandez à l'expéditeur d'en partager un nouveau.",
    alreadyTitle: 'Déjà connectés',
    alreadyDesc: 'Vous êtes déjà ami avec cette personne.',
    errorTitle: 'Une erreur est survenue',
    errorSpace: "Impossible de rejoindre cet espace. Réessayez ou demandez à l'expéditeur de partager un nouveau lien.",
    errorFriend: "Impossible d'accepter cette invitation. Veuillez réessayer.",
    tryAgain: 'Réessayer',
    friendPitch: (p) => `${p.name} souhaite vous ajouter comme ami sur GlobeExpenses.`,
    spacePitch: (p) => `${p.name} vous invite à rejoindre « ${p.space} » sur GlobeExpenses.`,
    accepting: 'Acceptation…',
    accept: "Accepter l'invitation",
    decline: 'Refuser',
    pickTitle: 'Qui êtes-vous dans cet espace ?',
    pickDesc: "Certains membres ont été ajoutés avant votre arrivée. Si l'un d'eux est vous, sélectionnez-le : votre compte sera associé aux dépenses de ce membre.",
    claimThisIsMe: "Associer — c'est moi",
    someoneNew: 'Je suis nouveau — ajoutez-moi avec un nom :',
    namePlaceholder: 'Votre nom…',
    join: 'Rejoindre',
    skip: 'Passer pour le moment',
    linking: 'Association de votre compte…',
    joinedTitle: (p) => `Vous avez rejoint ${p.space} !`,
    friendsTitle: 'Vous êtes maintenant amis !',
    joinedDesc: (p) => `Vous êtes maintenant membre de « ${p.space} » et connecté avec ${p.name}.`,
    friendsDesc: (p) => `${p.name} et vous êtes maintenant connectés. Vous pouvez vous inviter mutuellement dans des espaces partagés.`,
    openSpace: (p) => `Ouvrir ${p.space}`,
  },

  push: {
    banner: {
      a: 'Soyez averti quand des membres rejoignent votre espace et ajoutent ou modifient des transactions.',
      d: 'Soyez averti quand des membres rejoignent votre espace et ajoutent ou modifient des transactions.',
      b: 'Soyez averti quand des membres ajoutent ou modifient des transactions qui vous concernent.',
      e2: 'Soyez averti quand des membres ajoutent ou modifient des transactions qui vous concernent.',
      e1: "Quelqu'un a ajouté une transaction qui vous concerne. Être averti la prochaine fois ?",
    },
    bannerIosInstall: (p) => (
      <>
        Sur iPhone, ajoutez d'abord GlobeExpenses à votre écran d'accueil : touchez <strong>Partager</strong>{' '}
        {p.icon}, puis <strong>« Sur l'écran d'accueil »</strong>, et activez les
        notifications depuis l'application installée.
      </>
    ),
    enable: 'Activer',
    enabling: 'Activation…',
    notNow: 'Pas maintenant',
    dismiss: 'Fermer',

    device: {
      title: '🔔 Notifications',
      iosInstall: (p) => (
        <>
          Pour recevoir des notifications sur iPhone, ajoutez GlobeExpenses à votre écran d'accueil : touchez{' '}
          <strong>Partager</strong> {p.icon}, puis{' '}
          <strong>« Sur l'écran d'accueil »</strong>.
        </>
      ),
      unsupported: 'Ce navigateur ne prend pas en charge les notifications push.',
      blockedTitle: '🔔 Les notifications sont bloquées sur cet appareil.',
      blockedHint: 'Réactivez-les dans les réglages de votre téléphone → GlobeExpenses (ou dans les paramètres du site de votre navigateur).',
      onThisDevice: '🔔 Notifications sur cet appareil',
      promptHint: "Soyez averti quand quelqu'un ajoute ou modifie une transaction qui vous concerne.",
      onHint: "Activées. Chaque espace peut être mis en sourdine depuis son onglet Paramètres.",
      offHint: "Désactivées. Aucune notification n'arrive sur cet appareil.",
      switchLabel: 'Notifications sur cet appareil',
      updateFailed: 'Impossible de modifier les notifications. Vérifiez votre connexion et réessayez.',
    },

    space: {
      turnOffAll: (p) => <>Vous voulez désactiver toutes les notifications ?{' '}{p.link}</>,
      profileSettings: 'Paramètres du profil →',
      forThisSpace: '🔔 Notifications pour cet espace',
      switchLabel: 'Notifications pour cet espace',
      enableDevice: '🔔 Activer les notifications sur cet appareil',
      iosInstall: "🔔 Pour recevoir des notifications sur iPhone, ajoutez d'abord GlobeExpenses à votre écran d'accueil (Partager → « Sur l'écran d'accueil »).",
      blocked: '🔔 Les notifications sont bloquées sur cet appareil. Réactivez-les dans les réglages de votre téléphone → GlobeExpenses.',
      unsupported: '🔔 Ce navigateur ne prend pas en charge les notifications push.',
    },
  },

  install: {
    title: 'Installer GlobeExpenses',
    ios: (p) => (
      <>
        Touchez <strong>Partager</strong> {p.icon} dans la barre du navigateur, puis{' '}
        <strong>« Sur l'écran d'accueil »</strong>.
      </>
    ),
    chrome: "Ajoutez-la à votre écran d'accueil pour une expérience plus rapide, même hors ligne.",
    android: () => (
      <>
        Ouvrez le <strong>menu du navigateur</strong> (⋮) et touchez{' '}
        <strong>« Ajouter à l'écran d'accueil »</strong> ou <strong>« Installer l'application »</strong>.
      </>
    ),
    install: 'Installer',
    dismiss: "Fermer la bannière d'installation",
  },

  feedback: {
    thanks: 'Merci pour votre retour !',
    intro: "Votre avis compte ! Signalez instantanément un bug, une suggestion ou toute piste d'amélioration. Ajoutez vos coordonnées si vous souhaitez être recontacté.",
    placeholder: 'Écrivez votre retour ici…',
    sendFailed: "Échec de l'envoi du retour",
    sending: 'Envoi…',
    send: 'Envoyer',
    contactDeveloper: 'Contacter le développeur',
    madeBy: (p) => <>Fait avec 💜 par{' '}{p.author}{' '}en Asie du Sud-Est 🌏</>,
  },
}
