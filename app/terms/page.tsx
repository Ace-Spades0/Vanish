'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getLang, setLang, type Lang } from '@/lib/i18n'

const copy = {
  en: {
    back: '← Back',
    title: 'Terms of Service',
    updated: 'Last updated: October 2026',
    s1t: '1. Acceptance of Terms',
    s1p:
      'By using Go Vanish (including Get Started), you agree to these Terms of Service. If you do not agree, do not use the platform.',
    s2t: '2. Eligibility',
    s2p:
      'You must be at least 16 years old to use Go Vanish. By using the service, you confirm that you meet this age requirement.',
    s3t: '3. Disclaimer & warning',
    s3p:
      'Go Vanish is provided “as is”. We do not guarantee uninterrupted service, perfect delivery, or that every message will disappear in every edge case. No online service can guarantee perfect security. DO NOT SHARE SECRETS YOU CANNOT AFFORD TO EXPOSE. Use the platform at your own risk.',
    s4t: '4. Nature of the Service',
    s4p:
      'Go Vanish is a temporary and private messaging platform. Access does not require email or a password. You receive a temporary 6-character username. Messages are designed to disappear after a limited time. One-time letters and invite links are also temporary. The service is not a permanent archive of conversations.',
    s5t: '5. Temporary identity',
    s5p:
      'Your identity on Go Vanish is temporary. You are responsible for what you send under your temporary name. You may Leave or Wipe identity, which clears related chats, letters, and that name as described in the app. Clearing browser data may also end your session. We may suspend or block identities that break these Terms or harm other users.',
    s6t: '6. Acceptable use',
    s6p: 'You agree not to use Go Vanish to:',
    s6l1: 'Harass, threaten, or harm others',
    s6l2: 'Share illegal content or exploit minors',
    s6l3: 'Spam, scam, or impersonate others',
    s6l4: 'Attack, disrupt, or probe the service',
    s6l5: 'Bypass blocks, bans, or safety limits',
    s7t: '7. Safety tools',
    s7p:
      'Users may block and report others. We may act on reports, including warnings, limits, suspension, or ban of an identity. Anti-interrogation and time limits exist to reduce pressure and abuse.',
    s8t: '8. Content',
    s8p:
      'You are responsible for what you send. Ephemeral design does not make illegal or abusive content allowed. We may remove access when needed for safety or law.',
    s9t: '9. Limitation of liability',
    s9p1:
      'To the maximum extent permitted by law, Go Vanish and its operators are ',
    s9bold1: 'not liable',
    s9p2:
      ' for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, profits, or reputation, arising from your use of — or inability to use — the service.',
    s9p3: 'In plain terms: ',
    s9bold2:
      'we are not responsible for damages that go beyond what the law requires us to cover',
    s9p4:
      ', including problems caused by misuse, network failures, or content sent by other users.',
    s10t: '10. Changes',
    s10p:
      'We may update these Terms. Continued use of Go Vanish after changes means you accept the updated Terms.',
    s11t: '11. Contact',
    s11p:
      'For questions about these Terms, contact us through the support channel on the app or official site.',
  },
  sw: {
    back: '← Rudi',
    title: 'Masharti ya Huduma',
    updated: 'Imesasishwa: Oktoba 2026',
    s1t: '1. Kukubali masharti',
    s1p:
      'Kwa kutumia Go Vanish (pamoja na Get Started), unakubali Masharti haya. Usikubali — usitumie jukwaa.',
    s2t: '2. Ustahiki',
    s2p: 'Lazima uwe na angalau miaka 16 kutumia Go Vanish.',
    s3t: '3. Kanusho na onyo',
    s3p:
      'Go Vanish inatolewa “kama ilivyo”. Hatuahidi huduma isiyokatizwa kila wakati. Hakuna huduma inayohakikisha usalama kamili mtandaoni. USISHIRIKE SIRI USIZOWEZA KUHIMILI KUFICHULIWA. Tumia jukwaa kwa hatari yako mwenyewe.',
    s4t: '4. Asili ya huduma',
    s4p:
      'Go Vanish ni jukwaa la ujumbe wa muda na faragha. Haitaji barua pepe wala nenosiri. Unapata jina la herufi 6 la muda. Ujumbe hupotea baada ya muda. Si kumbukumbu ya kudumu.',
    s5t: '5. Utambulisho wa muda',
    s5p:
      'Utambulisho wako ni wa muda. Unawajibika kwa unachotuma. Unaweza Kuondoka au Kufuta utambulisho. Tunaweza kusimamisha utambulisho unaokiuka masharti.',
    s6t: '6. Matumizi yanayokubalika',
    s6p: 'Unakubali kutotumia Go Vanish kwa:',
    s6l1: 'Unyanyasaji au vitisho',
    s6l2: 'Maudhui haramu au unyonyaji wa watoto',
    s6l3: 'Spam, udanganyifu, au kujifanya mtu mwingine',
    s6l4: 'Kushambulia huduma',
    s6l5: 'Kupeleka vizuizi au marufuku',
    s7t: '7. Zana za usalama',
    s7p:
      'Watumiaji wanaweza kuzuia na kuripoti. Tunaweza kuchukua hatua ikiwa ni pamoja na kusimamisha utambulisho.',
    s8t: '8. Maudhui',
    s8p:
      'Unawajibika kwa unachotuma. Ujumbe wa muda hauruhusu maudhui haramu.',
    s9t: '9. Kikomo cha dhima',
    s9p1: 'Kwa kiwango kinachoruhusiwa na sheria, Go Vanish ',
    s9bold1: 'haiwajibiki',
    s9p2:
      ' kwa uharibifu wa aina isiyo ya moja kwa moja, hasara ya data, au hasara nyingine kutokana na matumizi ya huduma.',
    s9p3: 'Kwa maneno rahisi: ',
    s9bold2: 'hatubebi hasara zaidi ya sheria inavyotulazimisha',
    s9p4: ', ikiwa ni pamoja na matatizo kutoka kwa watumiaji wengine.',
    s10t: '10. Mabadiliko',
    s10p: 'Tunaweza kusasisha Masharti. Kuendelea kutumia kunamaanisha unakubali.',
    s11t: '11. Mawasiliano',
    s11p: 'Maswali: kupitia kituo cha msaada kwenye programu.',
  },
}

export default function TermsPage() {
  const router = useRouter()
  const [lang, setLangState] = useState<Lang>('en')
  const c = copy[lang]

  useEffect(() => {
    setLangState(getLang())
  }, [])

  const changeLang = (next: Lang) => {
    setLang(next)
    setLangState(next)
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => router.back()}
            className="text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full transition"
          >
            {c.back}
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => changeLang('en')}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                lang === 'en'
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => changeLang('sw')}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                lang === 'sw'
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
            >
              SW
            </button>
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-2">{c.title}</h1>
        <p className="text-zinc-400 text-sm mb-10">{c.updated}</p>
        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s1t}</h2>
            <p>{c.s1p}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s2t}</h2>
            <p>{c.s2p}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s3t}</h2>
            <p className="text-amber-200/95 font-medium leading-relaxed">
              {c.s3p}
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s4t}</h2>
            <p>{c.s4p}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s5t}</h2>
            <p>{c.s5p}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s6t}</h2>
            <p className="mb-2">{c.s6p}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{c.s6l1}</li>
              <li>{c.s6l2}</li>
              <li>{c.s6l3}</li>
              <li>{c.s6l4}</li>
              <li>{c.s6l5}</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s7t}</h2>
            <p>{c.s7p}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s8t}</h2>
            <p>{c.s8p}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s9t}</h2>
            <p>
              {c.s9p1}
              <strong className="text-white">{c.s9bold1}</strong>
              {c.s9p2}
            </p>
            <p className="mt-3">
              {c.s9p3}
              <strong className="text-white">{c.s9bold2}</strong>
              {c.s9p4}
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s10t}</h2>
            <p>{c.s10p}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s11t}</h2>
            <p>{c.s11p}</p>
          </section>
        </div>
      </div>
    </div>
  )
}