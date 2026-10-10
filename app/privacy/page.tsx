'use client'

import { useRouter } from 'next/navigation'

export default function PrivacyPage() {
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

        <h1 className="text-3xl font-bold mb-2">Privacy &amp; Security</h1>
        <p className="text-zinc-400 text-sm mb-10">Last updated: October 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Our Commitment</h2>
            <p>
              Go Vanish is designed with privacy as a core principle. Conversations are meant to
              be temporary. We collect only what is needed to run the service and to handle
              safety reports.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Data We Collect</h2>
            <p className="mb-3">We collect and process:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white">Account data:</span> email address and password
                (passwords are handled by our authentication provider; we do not store your
                plain password).
              </li>
              <li>
                <span className="text-white">Profile data:</span> temporary username, optional
                bio (max 20 characters), optional anonymous icon, offline preference.
              </li>
              <li>
                <span className="text-white">Communication data:</span> messages, images, files,
                videos, one-time letters, and related metadata (such as timestamps and
                conversation identifiers).
              </li>
              <li>
                <span className="text-white">Safety data:</span> reports, blocks, and limited
                safety logs (for example cleared chats or repeated rule triggers).
              </li>
              <li>
                <span className="text-white">Technical data:</span> basic logs needed for
                security and uptime, processed by our hosting and auth providers.
              </li>
            </ul>
            <p className="mt-3">
              We do not require your real name, phone number, or government ID to use Go Vanish.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Third-Party Processors</h2>
            <p className="mb-3">
              To operate Go Vanish we use infrastructure providers, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Authentication and database services (currently Supabase)</li>
              <li>Hosting (currently Vercel)</li>
              <li>Bot protection (e.g. CAPTCHA / Turnstile), when enabled</li>
            </ul>
            <p>
              These providers process data to provide their service under their own terms. We do
              not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white">Chat messages and media:</span> designed to
                disappear after the chat lifetime (normally about 3 hours from the first message,
                or earlier if cleared or limited by anti-interrogation rules).
              </li>
              <li>
                <span className="text-white">One-time letters:</span> until read once, or until
                they expire, then removed.
              </li>
              <li>
                <span className="text-white">Daily usernames:</span> active up to about 24 hours;
                used names may be reserved so they cannot be freely reused.
              </li>
              <li>
                <span className="text-white">Account data:</span> until you delete your account
                or we close it for violations.
              </li>
              <li>
                <span className="text-white">Reports and safety logs:</span> kept only as long as
                needed for safety, abuse review, or legal obligations, then deleted or minimized.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. User-Generated Content and Moderation
            </h2>
            <p className="mb-3">
              Go Vanish has zero tolerance for illegal or harmful content. Users can block and
              report others. We may remove content, limit features, suspend, or ban accounts after
              reports, automated signals, or review.
            </p>
            <p>
              We may keep limited report details to investigate repeat abuse. Ephemeral chat
              design does not guarantee that another person cannot copy or screenshot content on
              their own device.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. How We Use Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide accounts, search, chat, letters, and invites</li>
              <li>To enforce rules, process reports, and protect users</li>
              <li>To maintain security, prevent spam and abuse, and operate the service</li>
              <li>To comply with law when required</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Sharing</h2>
            <p>
              We do not sell personal data. We share data with service providers needed to run
              Go Vanish (such as hosting and authentication). We may also act on reports or
              disclose information when required to protect users or comply with law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Your Choices and Rights</h2>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Delete your account where the product allows</li>
              <li>Clear chats</li>
              <li>Block or report other users</li>
              <li>Go offline (hidden from search)</li>
              <li>Stop using Go Vanish at any time</li>
            </ul>
            <p>
              Depending on where you live, you may have additional rights to access, correct, or
              delete personal data. Contact us using the details below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Children’s Privacy</h2>
            <p>
              Go Vanish is not intended for anyone under 16. We do not knowingly create accounts
              for children under 16. If you believe a minor is using the service, please report it
              and we will take steps to remove the account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Security</h2>
            <p>
              We use industry-standard protections such as encryption in transit and access
              controls through our providers. No online service can guarantee perfect security.
              Do not share secrets you cannot afford to expose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. International Users</h2>
            <p>
              If you use Go Vanish from outside the country where our servers or providers
              operate, your information may be processed in other countries that may have
              different data-protection laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. No Sale of Data</h2>
            <p>
              We do not sell your personal information. We do not use third-party advertising
              networks in the current version of Go Vanish. If that changes, we will update this
              policy before enabling ads.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">13. Changes to This Policy</h2>
            <p>
              We may update this Privacy &amp; Security page from time to time. Continued use of
              Go Vanish means you accept the updated policy. Material changes may be highlighted
              in the app when practical.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">14. Contact</h2>
            <p>
              For privacy or security questions, contact us through the platform support channels.
              {/* Replace with your real email when ready, e.g. privacy@yourdomain.com */}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}