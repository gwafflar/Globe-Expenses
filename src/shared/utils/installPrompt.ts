// installPrompt.ts — captures the `beforeinstallprompt` event at module load time.
//
// `beforeinstallprompt` fires very early in the page lifecycle (often before
// React has finished rendering). A component-level addEventListener will almost
// always miss it. Instead, we register the listener here, which is imported by
// main.tsx before the React tree renders. Any component can then call
// getDeferredInstallPrompt() to access the captured event synchronously.

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let _deferredPrompt: BeforeInstallPromptEvent | null = null

// Register as early as possible — this module is side-effect imported in main.tsx.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // suppress the mini-infobar; we show our own UI
  _deferredPrompt = e as BeforeInstallPromptEvent
})

/** Returns the captured install prompt event, or null if not yet fired / unavailable. */
export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return _deferredPrompt
}

/** Call after the user accepts or dismisses to release the reference. */
export function clearDeferredInstallPrompt() {
  _deferredPrompt = null
}
