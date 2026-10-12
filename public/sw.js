self.addEventListener('push', (event) => {
  let notification = {
    title: 'Sunroom Shift',
    body: 'You have a new shop update.',
    icon: '/sunroom-shift/favicon.svg',
  }

  if (event.data) {
    try {
      notification = {
        ...notification,
        ...event.data.json(),
      }
    } catch {
      notification.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      data: notification.data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    clients.openWindow('/sunroom-shift/')
  )
})
