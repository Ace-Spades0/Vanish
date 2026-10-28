import { supabase } from '@/lib/supabase'

const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

export function isUsernameActive(profile: {
  id?: string | null
  username?: string | null
  username_claimed_at?: string | null
  is_permanent_username?: boolean | null
}) {
  if (!profile?.username) return false
  if (profile.is_permanent_username === true) return true
  if (profile.id === ADMIN_ID || profile.username?.toLowerCase() === 'lestat') {
    return true
  }
  if (!profile.username_claimed_at) return false
  const hoursPassed =
    (Date.now() - new Date(profile.username_claimed_at).getTime()) /
    (1000 * 60 * 60)
  return hoursPassed < 24
}

/** If no session or username expired → landing. Returns profile or null (already redirected). */
export async function requireActiveSession(
  router: { replace: (path: string) => void }
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    router.replace('/')
    return { user: null, profile: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !isUsernameActive(profile)) {
    await supabase.auth.signOut()
    router.replace('/')
    return { user: null, profile: null }
  }

  if (profile.status === 'banned' || profile.status === 'suspended') {
    router.replace('/appeal')
    return { user: null, profile: null }
  }

  return { user, profile }
}