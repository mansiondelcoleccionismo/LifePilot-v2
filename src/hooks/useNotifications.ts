import { useEffect, useState } from 'react'
import { requestPermission, initNotifications } from '@/services/notifications.service'

export function useNotifications() {
  const supported = 'Notification' in window
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  )

  useEffect(() => {
    if (permission === 'granted') initNotifications()
  }, [permission])

  async function ask(): Promise<NotificationPermission> {
    const result = await requestPermission()
    setPermission(result)
    return result
  }

  return { permission, supported, ask }
}
