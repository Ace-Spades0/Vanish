import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mjwhgylmdpdmwtwqkptn.supabase.co'
const supabaseAnonKey = 'sb_publishable_4N0JzokcA6cmAlVgEGyMug__ZO5Navb'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getValidUsername(userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, username_claimed_at')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.username || !profile.username_claimed_at) {
    return null
  }

  const hoursPassed =
    (Date.now() - new Date(profile.username_claimed_at).getTime()) / (1000 * 60 * 60)

  if (hoursPassed >= 24) {
    return null
  }

  return profile.username
}