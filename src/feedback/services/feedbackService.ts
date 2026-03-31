// feedbackService.ts — submits user feedback to Firestore.
//
// Firestore collection: /feedback/{feedbackId}
//
// Image upload via Firebase Storage is commented out until Storage is configured.
// When ready, uncomment the Storage imports and the image block below.

import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore'
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
// import { storage } from '@/services/firebase'
import { db } from '@/services/firebase'

// const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

export interface FeedbackPayload {
  text: string
  // image?: File | null  // uncomment when Storage is configured
  /** Which page/section the form was submitted from (e.g. "ProfilePage", "ParametersTab") */
  source: string
}

/**
 * Submit feedback to Firestore (fire-and-forget write, consistent with project convention).
 */
/**
 * Submit feedback to Firestore.
 * Works for both authenticated and unauthenticated users (e.g. WelcomePage).
 * Uses fire-and-forget write (project convention: doc() + setDoc() without await).
 */
export async function submitFeedback(
  userId: string | null,
  displayName: string | null,
  payload: FeedbackPayload,
): Promise<void> {
  const feedbackRef = doc(collection(db, 'feedback'))

  // Image upload — uncomment when Firebase Storage is configured
  // let imageUrl: string | null = null
  // if (payload.image) {
  //   if (payload.image.size > MAX_IMAGE_SIZE) throw new Error('Image must be smaller than 5 MB')
  //   if (!payload.image.type.startsWith('image/')) throw new Error('Only image files are allowed')
  //   const ext = payload.image.type.split('/')[1] || 'png'
  //   const storageRef = ref(storage, `feedback/${userId}/${feedbackRef.id}.${ext}`)
  //   await uploadBytes(storageRef, payload.image)
  //   imageUrl = await getDownloadURL(storageRef)
  // }

  // Awaited (not fire-and-forget) so the UI can show success/failure to the user
  await setDoc(feedbackRef, {
    userId: userId ?? 'anonymous',
    displayName: displayName ?? 'Anonymous',
    text: payload.text,
    // ...(imageUrl && { imageUrl }),  // uncomment when Storage is configured
    source: payload.source,
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
  })
}
