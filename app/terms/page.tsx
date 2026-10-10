'use client'

import { useRouter } from 'next/navigation'

export default function TermsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-full mb-8 transition"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-zinc-400 text-sm mb-10">Last updated: October 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using Go Vanish, you agree to these Terms of Service
              and our Privacy &amp; Security policy. If you do not agree, do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
            <p>
              You must be at least 16 years old to use Go Vanish. By using the service, you
              confirm that you meet this age requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Nature of the Service</h2>
            <p className="mb-3">
              Go Vanish is a temporary and private messaging platform. Core product rules include:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Usernames are temporary (about 24 hours) unless a clearly labeled longer or paid
                option is offered later.
              </li>
              <li>
                Chats are designed to end about 3 hours after the first message, or sooner if
                cleared or limited by anti-interrogation rules.
              </li>
              <li>One-time letters are intended to be readable once, then gone.</li>
              <li>
                Vanish links are one-use invitations to start a chat or send a letter; after use
                or expiry they stop working.
              </li>
              <li>There is no last-seen and no read receipts by design.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. User-Generated Content (UGC) — Zero Tolerance
            </h2>
            <p className="mb-3">
              You are solely responsible for the content you transmit (text, images, files,
              videos, letters). We have zero tolerance for objectionable or illegal content.
            </p>
            <p className="mb-2 text-white font-medium">Prohibited content and conduct includes:</p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Illegal activity, exploitation, or any content involving minors</li>
              <li>Threats, harassment, stalking, or bullying</li>
              <li>Hate speech or discrimination</li>
              <li>Scams, fraud, impersonation, or phishing</li>
              <li>Non-consensual intimate imagery or unlawful sexual content</li>
              <li>Malware, spam, or attempts to break, scrape, or abuse the service</li>
            </ul>
            <p>
              We may remove content, suspend or ban accounts, and preserve limited information
              when required for safety or law. We may cooperate with law enforcement when we have
              a good-faith belief it is required or appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Safety Tools</h2>
            <p className="mb-3">You can:</p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Block other accounts</li>
              <li>Report users (with a report type and written explanation)</li>
              <li>Report a specific message where the product allows (e.g. hold a message)</li>
              <li>Clear a chat</li>
            </ul>
            <p>
              Use Report and Block responsibly. False or abusive reporting may lead to action
              against your account. Blocks apply to the account, not only a temporary username.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Anti-Interrogation and Chat Limits
            </h2>
            <p>
              Go Vanish may warn users and shorten or end a chat when behavior looks like
              pressure, spam, or excessive questioning. Details may appear in-product. These
              tools exist to protect users; they are not a guarantee that every harmful
              interaction will be stopped automatically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Invites, Letters, and Usernames
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                You may not use invite links or letters to spam, harass, or bypass a block or ban.
              </li>
              <li>
                Used usernames may be reserved so they cannot be freely reused, except for options
                we clearly describe later (for example paid or permanent names).
              </li>
              <li>
                Ephemeral design reduces retention; it does not stop someone from screenshotting
                or copying content on their device.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Accounts, Suspension, and Termination
            </h2>
            <p className="mb-3">
              We may suspend or terminate accounts for violations, repeated reports, repeated
              abuse of safety systems, fraud, or risk to others. You may delete your account where
              the product allows.
            </p>
            <p>
              Some safety records may remain for a limited time after deletion when needed for
              security or legal reasons.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Disclaimer</h2>
            <p>
              Go Vanish is provided “as is”. We do not guarantee uninterrupted service, complete
              privacy, exact deletion timing every second, or that every user will follow the law.
              Use the platform at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              10. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, Go Vanish and its operators shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages
              arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of Go Vanish after
              changes means you accept the updated Terms. Material changes may be highlighted in
              the app when practical.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Contact</h2>
            <p>
              For questions about these Terms, contact us through the platform support channels
              or the contact method listed on our Privacy &amp; Security page.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}