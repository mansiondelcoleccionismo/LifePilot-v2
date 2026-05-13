import { useGoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '@/store/auth.store'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
].join(' ')

export function useGoogleAuth() {
  const { login, logout, user, isLoggedIn } = useAuthStore()

  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        const info = await res.json() as { name?: string; email?: string; picture?: string }
        login({
          name:        info.name    ?? 'Usuario',
          email:       info.email   ?? '',
          picture:     info.picture ?? '',
          accessToken: tokenResponse.access_token,
        })
      } catch (err) {
        console.error('Error obteniendo perfil de Google:', err)
      }
    },
    onError: (err) => console.error('Google OAuth error:', err),
    scope: SCOPES,
  })

  return { loginWithGoogle, logout, user, isLoggedIn }
}
