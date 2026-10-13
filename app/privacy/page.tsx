'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getLang, setLang, translations, type Lang } from '@/lib/i18n'

const copy = {
  en: {
    back: '← Back',
    title: 'Privacy & Security',
    updated: 'Last updated: October 2026',
    s1t: '1. Our commitment',
    s1p:
      'Go Vanish is built for temporary, private conversation. We aim to keep only what is needed to run accounts, deliver messages for a short time, and keep the platform safe. We do not build advertising profiles about you.',
    s2t: '2. Data we collect',
    s2p:
      'We collect as little as practical. We do not ask for your real name, phone book, or location for chatting.',
    s2a: 'Account',
    s2a1: 'Email and password (so you can sign in and recover access)',
    s2a2: 'A temporary username (and, if you choose, a short bio and anonymous icon)',
    s2b: 'While you use Go Vanish',
    s2b1: 'Messages and limited media inside a chat — only for the life of that chat (about 3 hours from the first message, or earlier if cleared or limited for safety)',
    s2b2: 'One-time letters until they are read or expire',
    s2b3: 'Invite links you create, until used or expired',
    s2c: 'Safety',
    s2c1: 'Reports, blocks, and limited safety logs when needed to handle abuse',
    s2note:
      'We do not require a public permanent identity. Daily usernames are temporary by design.',
    s3t: '3. How we use information',
    s3l1: 'To create and secure your account',
    s3l2: 'To deliver chats, letters, and invites',
    s3l3: 'To apply time limits and auto-delete ephemeral content',
    s3l4: 'To process blocks, reports, and account safety actions',
    s3l5: 'To operate and improve reliability of the service',
    s4t: '4. Data retention',
    s4l1: 'Chat messages: removed after the chat lifetime (about 3 hours from the first message), or sooner if cleared',
    s4l2: 'Letters: removed after read or expiry',
    s4l3: 'Invite links: removed after use or expiry',
    s4l4: 'Account data: kept while your account exists; removed when you delete your account (except limited safety records we may need to keep briefly)',
    s4l5: 'Reports / safety logs: kept only as long as needed for safety and abuse handling',
    s5t: '5. Sharing information',
    s5p:
      'We do not sell your personal information. We do not sell your messages, email, or username for marketing.',
    s5no: 'No sale of data',
    s5nop:
      'We do not sell, rent, or trade your personal data to data brokers or advertisers.',
    s5who: 'Who may process data for us',
    s5whop:
      'To run Go Vanish we use trusted infrastructure providers (for example hosting, database, and authentication). They process data only to provide those services, not to sell it. We do not publish internal system diagrams or security configuration in this policy.',
    s5law: 'Legal and safety',
    s5lawp:
      'We may share limited information if required by law, or when needed to protect users from serious harm or clear abuse, based on reports and our safety process.',
    s6t: '6. We do not track you for ads or behavior profiles',
    s6p:
      'We do not track your usage patterns to build marketing profiles. We do not read your private messages for advertising. We do not sell behavioral data. Safety tools (such as reports) are for protection, not advertising.',
    s7t: '7. Your choices and rights',
    s7l1: 'Delete your account from the app',
    s7l2: 'Clear a chat',
    s7l3: 'Block or report another user',
    s7l4: 'Go offline so others cannot find you in search',
    s7l5: 'Request help about your data through the contact channel below',
    s8t: '8. Children’s privacy',
    s8p:
      'Go Vanish is not for children under 16. If you believe a minor is using the service, please report it.',
    s9t: '9. Security',
    s9p:
      'We use reasonable technical and organizational measures to protect accounts and data. No online service is perfectly secure. Use a strong password and protect your email.',
    s10t: '10. Changes',
    s10p:
      'We may update this Privacy & Security page. Continued use after changes means you accept the updated policy.',
    s11t: '11. Contact',
    s11p:
      'For privacy questions, contact us through the support channel published on the app or official site.',
  },
  sw: {
    back: '← Rudi',
    title: 'Faragha na Usalama',
    updated: 'Imesasishwa: Oktoba 2026',
    s1t: '1. Ahadi yetu',
    s1p:
      'Go Vanish imeundwa kwa mazungumzo ya muda mfupi na ya faragha. Tunahifadhi tu kinachohitajika kuendesha akaunti, kupeleka ujumbe kwa muda mfupi, na kulinda jukwaa. Hatuundi wasifu wa matangazo kukuhusu.',
    s2t: '2. Data tunayokusanya',
    s2p:
      'Tunakusanya kidogo iwezekanavyo. Hatuombi jina lako halisi, orodha ya simu, wala eneo lako ili kuzungumza.',
    s2a: 'Akaunti',
    s2a1: 'Barua pepe na nenosiri (kuingia na kurejesha ufikiaji)',
    s2a2: 'Jina la muda (na bio fupi au aikoni ya siri ukichagua)',
    s2b: 'Unapotumia Go Vanish',
    s2b1: 'Ujumbe na midia ndani ya gumzo — kwa maisha ya gumzo hilo tu (karibu saa 3 kutoka ujumbe wa kwanza, au mapema ikifutwa)',
    s2b2: 'Barua za mara moja hadi zisomeswe au zimeisha muda',
    s2b3: 'Viungo vya mwaliko hadi vitumiwe au vimwishike',
    s2c: 'Usalama',
    s2c1: 'Ripoti, vizuizi, na kumbukumbu chache za usalama inapohitajika',
    s2note:
      'Hatuhitaji utambulisho wa kudumu wa umma. Majina ya kila siku ni ya muda kwa makusudi.',
    s3t: '3. Jinsi tunavyotumia taarifa',
    s3l1: 'Kuunda na kulinda akaunti yako',
    s3l2: 'Kupeleka gumzo, barua, na mialiko',
    s3l3: 'Kutumia muda na kufuta maudhui ya muda',
    s3l4: 'Kushughulikia vizuizi, ripoti, na usalama',
    s3l5: 'Kuendesha na kuboresha huduma',
    s4t: '4. Uhifadhi wa data',
    s4l1: 'Ujumbe: hufutwa baada ya maisha ya gumzo (karibu saa 3), au mapema',
    s4l2: 'Barua: baada ya kusomwa au muda kuisha',
    s4l3: 'Mialiko: baada ya kutumika au muda kuisha',
    s4l4: 'Akaunti: wakati akaunti ipo; hufutwa unapofuta akaunti',
    s4l5: 'Ripoti / usalama: muda unaohitajika tu',
    s5t: '5. Kushiriki taarifa',
    s5p:
      'Hatuuzi taarifa zako binafsi. Hatuuzi ujumbe, barua pepe, wala jina lako kwa matangazo.',
    s5no: 'Hakuna uuzaji wa data',
    s5nop:
      'Hatuuzi, kukodisha, wala kubadilishana data yako na madalali wa data au watangazaji.',
    s5who: 'Wanaoweza kuchakata data kwa niaba yetu',
    s5whop:
      'Tunatumia watoa huduma wa miundombinu wanaoaminika (kwa mfano uwekaji, hifadhidata, uthibitishaji). Wanachakata data ili kutoa huduma hizo tu, si kuiuza. Hatuachili maelezo ya ndani ya usalama katika sera hii.',
    s5law: 'Sheria na usalama',
    s5lawp:
      'Tunaweza kushiriki taarifa chache ikiwa inahitajika kisheria, au kulinda watumiaji dhidi ya madhara makubwa.',
    s6t: '6. Hatukufuatilii kwa matangazo',
    s6p:
      'Hatufuatilii mifumo yako ya matumizi kujenga wasifu wa masoko. Hatusomi ujumbe wako wa faragha kwa matangazo. Hatuuzi data ya tabia. Zana za usalama ni kwa ulinzi, si matangazo.',
    s7t: '7. Chaguo na haki zako',
    s7l1: 'Futa akaunti yako',
    s7l2: 'Futa gumzo',
    s7l3: 'Zuia au ripoti mtumiaji',
    s7l4: 'Nenda nje ya mtandao ili usipatikane kwenye utafutaji',
    s7l5: 'Omba msaada kuhusu data yako',
    s8t: '8. Faragha ya watoto',
    s8p: 'Go Vanish si kwa watoto chini ya miaka 16.',
    s9t: '9. Usalama',
    s9p:
      'Tunatumia hatua zinazofaa za ulinzi. Hakuna huduma iliyo salama kikamilifu mtandaoni.',
    s10t: '10. Mabadiliko',
    s10p: 'Tunaweza kusasisha ukurasa huu. Kuendelea kutumia kunamaanisha unakubali sera mpya.',
    s11t: '11. Mawasiliano',
    s11p: 'Maswali ya faragha: kupitia kituo cha msaada kwenye programu.',
  },
}

export default function PrivacyPage() {
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
            <p className="mb-3">{c.s2p}</p>
            <p className="text-white font-medium mb-1">{c.s2a}</p>
            <ul className="list-disc pl-6 space-y-1 mb-3">
              <li>{c.s2a1}</li>
              <li>{c.s2a2}</li>
            </ul>
            <p className="text-white font-medium mb-1">{c.s2b}</p>
            <ul className="list-disc pl-6 space-y-1 mb-3">
              <li>{c.s2b1}</li>
              <li>{c.s2b2}</li>
              <li>{c.s2b3}</li>
            </ul>
            <p className="text-white font-medium mb-1">{c.s2c}</p>
            <ul className="list-disc pl-6 space-y-1 mb-3">
              <li>{c.s2c1}</li>
            </ul>
            <p className="text-zinc-400 text-sm">{c.s2note}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s3t}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{c.s3l1}</li>
              <li>{c.s3l2}</li>
              <li>{c.s3l3}</li>
              <li>{c.s3l4}</li>
              <li>{c.s3l5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s4t}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{c.s4l1}</li>
              <li>{c.s4l2}</li>
              <li>{c.s4l3}</li>
              <li>{c.s4l4}</li>
              <li>{c.s4l5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s5t}</h2>
            <p className="mb-4">{c.s5p}</p>
            <p className="text-white font-semibold mb-1">{c.s5no}</p>
            <p className="mb-4">{c.s5nop}</p>
            <p className="text-white font-medium mb-1">{c.s5who}</p>
            <p className="mb-4">{c.s5whop}</p>
            <p className="text-white font-medium mb-1">{c.s5law}</p>
            <p>{c.s5lawp}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s6t}</h2>
            <p>{c.s6p}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s7t}</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>{c.s7l1}</li>
              <li>{c.s7l2}</li>
              <li>{c.s7l3}</li>
              <li>{c.s7l4}</li>
              <li>{c.s7l5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s8t}</h2>
            <p>{c.s8p}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">{c.s9t}</h2>
            <p>{c.s9p}</p>
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


