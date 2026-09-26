export type Lang = 'en' | 'sw'

export const translations = {
  en: {
    appName: 'VANISH',
    tagline: 'Talk freely. Stay private.',
    subtitle: 'Temporary usernames. Messages that disappear. No permanent identity.',
    getStarted: 'Get Started',
    login: 'Login',
    hourMessages: '3-Hour Messages',
    hourMessagesDesc: 'Every message automatically disappears after 3 hours.',
    antiInterrogation: 'Anti-Interrogation',
    antiInterrogationDesc:
      'Protects conversations from pressure and spam. Fair warnings before any limits apply.',
    dailyUsernames: 'Daily Usernames',
    dailyUsernamesDesc: 'Pick a new name every 24 hours. Fully temporary identity.',
    terms: 'Terms of Service',
    privacy: 'Privacy & Security',
    termsShort: 'Terms',
    privacyShort: 'Privacy',
    username: 'Username',
    noUsername: 'No username',
    privateByDesign: 'Private by design',
    offline: 'Offline',
    pickUsername: 'Pick a username',
    startChat: 'Start a vanishing chat',
    profile: 'Profile',
    blockedUsers: 'Blocked users',
    noBlockedUsers: 'No blocked users',
    logout: 'Logout',
    deleteAccount: 'Delete account',
    deleteAccountTitle: 'Delete account?',
    deleteAccountDesc: 'This permanently deletes your account. This cannot be undone.',
    cancel: 'Cancel',
    delete: 'Delete',
    deleting: 'Deleting...',
    unblock: 'Unblock',
    admin: 'Admin',
    language: 'Language',
    loading: 'Loading VANISH...',
  },
  sw: {
    appName: 'VANISH',
    tagline: 'Ongea kwa uhuru. Kaa faraghani.',
    subtitle: 'Majina ya muda. Ujumbe unaotoweka. Hakuna utambulisho wa kudumu.',
    getStarted: 'Anza',
    login: 'Ingia',
    hourMessages: 'Ujumbe wa Saa 3',
    hourMessagesDesc: 'Kila ujumbe hufutwa kiotomatiki baada ya saa 3.',
    antiInterrogation: 'Kinga dhidi ya Uchunguzi',
    antiInterrogationDesc:
      'Hulinda mazungumzo dhidi ya shinikizo na spam. Onyo la haki kabla ya mipaka.',
    dailyUsernames: 'Majina ya Kila Siku',
    dailyUsernamesDesc: 'Chagua jina jipya kila saa 24. Utambulisho wa muda tu.',
    terms: 'Sheria na Masharti',
    privacy: 'Faragha na Usalama',
    termsShort: 'Sheria',
    privacyShort: 'Faragha',
    username: 'Jina la mtumiaji',
    noUsername: 'Hakuna jina',
    privateByDesign: 'Faragha kwa muundo',
    offline: 'Nje ya mtandao',
    pickUsername: 'Chagua jina',
    startChat: 'Anza gumzo linalotoweka',
    profile: 'Wasifu',
    blockedUsers: 'Waliozuiwa',
    noBlockedUsers: 'Hakuna waliozuiwa',
    logout: 'Toka',
    deleteAccount: 'Futa akaunti',
    deleteAccountTitle: 'Futa akaunti?',
    deleteAccountDesc: 'Hii itafuta akaunti yako kabisa. Haiwezi kurekebishwa.',
    cancel: 'Ghairi',
    delete: 'Futa',
    deleting: 'Inafuta...',
    unblock: 'Ondoa zuio',
    admin: 'Admin',
    language: 'Lugha',
    loading: 'Inapakia VANISH...',
  },
} as const

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  const saved = localStorage.getItem('vanish_lang')
  return saved === 'sw' ? 'sw' : 'en'
}

export function setLang(lang: Lang) {
  if (typeof window === 'undefined') return
  localStorage.setItem('vanish_lang', lang)
}