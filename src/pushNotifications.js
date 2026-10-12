
import { supabase } from './supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/')

    const rawData = window.atob(base64)
    return Uint8Array.from(rawData, (char) => char.charCodeAt(0))
}

export async function enablePushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported by this browser.')
    }

    if (!VAPID_PUBLIC_KEY) {
        throw new Error('VITE_VAPID_PUBLIC_KEY is missing from your .env file.')
    }

    const permission = await Notification.requestPermission()

    if (permission !== 'granted') {
        throw new Error('Notification permission was not granted.')
    }

    const registration = await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
    }

    const { data, error } = await supabase.functions.invoke(
        'register-push-subscription',
        {
            body: {
                endpoint: subscription.endpoint,
                subscription: subscription.toJSON(),
            },
        },
    )

    if (error || data?.error) {
        throw new Error(
            data?.error || error?.message || 'Could not register this device.',
        )
    }

    return 'Push notifications enabled on this device.'
}
