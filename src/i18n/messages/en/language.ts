// language.ts — the language picker in Profile.

export const language = {
  label: 'Language',
  hint: 'Language of the app on all your devices.',
  // `browser` is the native name of the detected browser language, e.g. 'Français'.
  auto: (p: { browser: string }) => `Automatic (${p.browser})`,
}
