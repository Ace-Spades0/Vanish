export const ADMIN_ID = 'a78d8a8e-de03-4159-a3c2-b5788e7cf5b7'

export function isUsernameActive(profile: {
  id?: string | null
  username?: string | null
  username_claimed_at?: string | null
  is_permanent_username?: boolean | null
} | null | undefined): boolean {
  if (!profile?.username) return false

  // Permanent never expires
  if (profile.is_permanent_username === true) return true

  // Belt-and-suspenders: admin + LESTAT always active
  if (
    profile.id === ADMIN_ID &&
    profile.username.toLowerCase() === 'lestat'
  ) {
    return true
  }

  if (!profile.username_claimed_at) return false

  const hoursPassed =
    (Date.now() - new Date(profile.username_claimed_at).getTime()) /
    (1000 * 60 * 60)

  return hoursPassed < 24
}