// common.ts (FR) — see messages/en/common.ts. The `Messages['common']` type
// annotation makes TypeScript reject a missing or extra key.

import type { Messages } from '../en'

export const common: Messages['common'] = {
  cancel: 'Annuler',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  delete: 'Supprimer',
  edit: 'Modifier',
  close: 'Fermer',
  confirm: 'Confirmer',
  back: 'Retour',
  next: 'Suivant',
  done: 'Terminé',
  add: 'Ajouter',
  remove: 'Retirer',
  rename: 'Renommer',
  create: 'Créer',
  continue: 'Continuer',
  retry: 'Réessayer',
  copy: 'Copier',
  copied: 'Copié !',
  share: 'Partager',
  search: 'Rechercher',
  loading: 'Chargement…',
  yes: 'Oui',
  no: 'Non',
  ok: 'OK',
  none: 'Aucun',
  all: 'Tous',
  optional: 'Facultatif',
  unknownError: 'Une erreur est survenue. Veuillez réessayer.',
  notFound: '404 — Page introuvable',
}
