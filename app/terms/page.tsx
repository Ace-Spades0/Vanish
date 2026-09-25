'use client'

import { useRouter } from 'next/navigation'

export default function TermsPage() {
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

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-zinc-400 text-sm mb-10">Last updated: September 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using VANISH, you agree to these Terms of Service.
              If you do not agree, do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
            <p>
              You must be at least 16 years old to use VANISH. By using the service, you
              confirm that you meet this age requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Nature of the Service</h2>
            <p>
              VANISH is a temporary and private messaging platform. Usernames are temporary
              and messages are designed to disappear automatically. VANISH does not provide
              permanent identity or permanent message storage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Acceptable Use</h2>
            <p className="mb-3">You agree not to use VANISH to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Harass, threaten, or harm others</li>
              <li>Share illegal content</li>
              <li>Promote scams, fraud, or phishing</li>
              <li>Share sexual content involving minors</li>
              <li>Spam or abuse the platform</li>
              <li>Attempt to hack, disrupt, or reverse-engineer the service</li>
              <li>Repeatedly pressure, interrogate, or overwhelm other users</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Usernames</h2>
            <p>
              Usernames on VANISH are temporary and can only be used once. Once a username
              has been claimed, it cannot be reused by anyone. You are responsible for any
              activity under your claimed username while it is active.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Messages and Content</h2>
            <p>
              Messages, photos, files, and videos may automatically expire and be deleted.
              By default, messages are designed to disappear after 3 hours. VANISH is not
              responsible for any content that users choose to send. You are solely
              responsible for the content you share.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Anti-Interrogation Protection</h2>
            <p className="mb-3">
              VANISH includes anti-interrogation protection to reduce pressure, spam-style
              questioning, and unsafe conversation patterns. This is a protection feature,
              not a punishment for normal conversation.
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>
                Repeated question-style messages in a conversation may be treated as
                interrogation behavior.
              </li>
              <li>
                When interrogation behavior is detected, the system issues clear warnings to
                the sender first.
              </li>
              <li>
                <strong className="text-white">Warning 1:</strong> You are notified to slow
                down.
              </li>
              <li>
                <strong className="text-white">Warning 2:</strong> Final warning before limits
                apply.
              </li>
              <li>
                After two warnings, continued interrogation behavior may shorten that
                conversation so new messages expire in{' '}
                <strong className="text-white">30 minutes</strong> instead of 3 hours.
              </li>
              <li>
                Normal conversation is not restricted. This rule is meant to protect users
                from pressure and spam-like questioning.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Reports, Blocks & Enforcement</h2>
            <p>
              Users may report or block others. VANISH may review reports and take action,
              including removing content, suspending accounts, or terminating accounts, when
              necessary to protect the platform and its users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Automatic Account Suspension or Termination</h2>
            <p className="mb-3">
              To protect users, VANISH may automatically suspend or terminate an account when
              certain abuse thresholds are reached, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Multiple reports from other users against the same account</li>
              <li>
                Anti-interrogation protection being triggered more than 10 times by the same
                account
              </li>
            </ul>
            <p className="mb-3">When this happens, VANISH may:</p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Suspend the account immediately</li>
              <li>Restrict or block the email address from creating a new account</li>
              <li>Permanently terminate the account in serious or repeated cases</li>
            </ul>
            <p>
              VANISH may take these actions without prior notice when needed to protect the
              safety of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Account Suspension</h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate these Terms,
              with or without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Disclaimer</h2>
            <p>
              VANISH is provided “as is”. We do not guarantee uninterrupted service, complete
              privacy, or that messages will always disappear exactly as expected. Use the
              platform at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, VANISH and its operators shall not be
              liable for any damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of VANISH after
              changes means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">14. Contact</h2>
            <p>
              For questions about these Terms, contact us through the platform support channels.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}