// NotificationClickHandler.tsx — opens the right page when a notification is
// tapped while the app is already running (docs/NOTIFICATIONS_SPEC.md §9.5).
//
// The tap is received by the service worker (public/push-sw.js), which lives
// outside the page and cannot use the React router. It posts a message to the
// open window instead; this component listens for it and navigates in-app, so
// nothing reloads. (When the app is closed, the service worker simply opens a
// new window on the target URL and this component is not involved.)

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function NotificationClickHandler() {
  const navigate = useNavigate()

  // useEffect with a cleanup: add the listener once after the first render,
  // remove it if the component ever unmounts.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; url?: string } | null
      // Only our own message type, and only in-app paths ("/spaces/…").
      if (data?.type !== 'notification-click' || typeof data.url !== 'string') return
      if (!data.url.startsWith('/') || data.url.startsWith('//')) return
      navigate(data.url)
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  return null // renders nothing: it only listens
}
