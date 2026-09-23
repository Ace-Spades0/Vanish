'use client'

import { useRouter } from 'next/navigation'

export default function PrivacyPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => router.back()}
          className="text-sm text-zinc-400 hover:text-white mb-8"
        >
          ← Back
        </button>

        <h1 className="text-3xl font-bold mb-2">Privacy & Security</h1>
        <p className="text-zinc-400 text-sm mb-10">Last updated: September 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Our Privacy Approach</h2>
            <p>
              VANISH is designed around temporary identity and temporary conversations.
              We aim to collect only what is necessary to operate the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Email address (for account creation and login)</li>
              <li>Temporary username</li>
              <li>Messages, photos, files, and videos you send (stored temporarily)</li>
              <li>Report and safety-related records</li>
              <li>Anti-interrogation and abuse-prevention records</li>
              <li>Basic technical data needed to run the service securely</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. How Long Data Is Kept</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Messages normally expire after 3 hours</li>
              <li>In some cases (anti-interrogation), chats may expire after 30 minutes</li>
              <li>Usernames are temporary and cannot be reused once claimed</li>
              <li>Account email remains while your account exists</li>
              <li>Safety records related to reports or repeated anti-interrogation events may be kept longer for moderation and enforcement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Messages & Media</h2>
            <p>
              Conversations on VANISH are designed to disappear. Uploaded photos, files, and
              videos are subject to the same temporary rules as messages. Cleared chats and
              certain safety events may be logged for moderation purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Safety Features</h2>
            <p className="mb-3">VANISH includes tools to help keep users safer:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Block users</li>
              <li>Report users</li>
              <li>Clear chat</li>
              <li>Anti-interrogation protection</li>
              <li>Automatic suspension or termination of accounts that repeatedly trigger safety systems</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Automatic Enforcement</h2>
            <p className="mb-3">
              If an account receives multiple reports, or if anti-interrogation protection is
              triggered more than 10 times by the same account, VANISH may automatically:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Suspend the account</li>
              <li>Block the associated email from registering again</li>
              <li>Terminate the account in serious cases</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Security</h2>
            <p>
              We use industry-standard practices to protect accounts and data. However, no
              online service can guarantee absolute security. You are responsible for keeping
              your login details private.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Sharing of Information</h2>
            <p>
              We do not sell your personal information. Data may be processed by infrastructure
              providers needed to run VANISH (such as hosting and authentication services).
              We may also act on reports when required to protect users or comply with law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Your Choices</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You can stop using VANISH at any time</li>
              <li>You can clear chats</li>
              <li>You can block or report other users</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Children’s Privacy</h2>
            <p>
              VANISH is not intended for children under 16. If you believe a minor is using
              the service, please report it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy & Security page from time to time. Continued use of
              VANISH means you accept the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Contact</h2>
            <p>
              For privacy or security questions, contact us through the platform support channels.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}