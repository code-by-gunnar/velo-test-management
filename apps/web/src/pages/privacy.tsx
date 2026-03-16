import Link from "next/link"
import Head from "next/head"
import { ArrowLeft, Mail } from "lucide-react"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-gray-900">{title}</h2>
      <div className="space-y-2 text-gray-700 leading-relaxed text-sm">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy — Velo</title>
      </Head>

      <div className="min-h-screen bg-mist">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Velo
          </Link>

          <h1 className="font-display text-page-title text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">
            Last updated: March 2026
          </p>

          <div className="space-y-8">
            {/* 1. Data Controller */}
            <Section title="1. Data Controller">
              <p>
                Velo Test Management (&ldquo;Velo&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is the
                data controller for the personal data processed through this service.
              </p>
              <p>
                Contact:{" "}
                <a href="mailto:support@runvelo.app" className="text-primary hover:underline">
                  support@runvelo.app
                </a>
              </p>
            </Section>

            {/* 2. What We Collect */}
            <Section title="2. What We Collect">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <span className="font-medium text-gray-800">Account data</span> — your name, email
                  address, and password (stored as a one-way hash, never in plain text).
                </li>
                <li>
                  <span className="font-medium text-gray-800">Profile data</span> — avatar image, if
                  you choose to upload one.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Usage data</span> — test cases, test
                  runs, and results you create within a workspace.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Technical data</span> — IP address and
                  browser type, recorded in server logs. We do not use tracking scripts or analytics
                  pixels.
                </li>
              </ul>
            </Section>

            {/* 3. Why We Process It */}
            <Section title="3. Why We Process It">
              <p>
                We process your data to provide the Velo service under{" "}
                <span className="font-medium">Article 6(1)(b) GDPR</span> — performance of a
                contract. When you create an account and use Velo, processing your data is necessary
                to deliver the service you signed up for.
              </p>
              <p>
                We do not process data based on consent, we do not send marketing emails, and we do
                not share data with third-party advertisers.
              </p>
            </Section>

            {/* 4. Who We Share With */}
            <Section title="4. Who We Share With">
              <p>
                We share data only with sub-processors that are strictly necessary to operate the
                service:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <span className="font-medium text-gray-800">Railway</span> — application and
                  database hosting
                </li>
                <li>
                  <span className="font-medium text-gray-800">Vercel</span> — frontend hosting and
                  edge delivery
                </li>
                <li>
                  <span className="font-medium text-gray-800">Cloudflare R2</span> — file storage
                  (attachments, CI payloads)
                </li>
                <li>
                  <span className="font-medium text-gray-800">Resend</span> — transactional email
                  (verification, password reset)
                </li>
              </ul>
              <p>We do not sell your data to anyone.</p>
            </Section>

            {/* 5. Retention Periods */}
            <Section title="5. How Long We Keep Your Data">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <span className="font-medium text-gray-800">Account data</span> — retained while
                  your account is active.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Workspace data</span> — retained while
                  the workspace exists. Hard-deleted 30 days after a workspace admin requests
                  deletion.
                </li>
                <li>
                  <span className="font-medium text-gray-800">User data after erasure request</span>{" "}
                  — anonymized within 7 days of the request.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Server logs</span> — retained for 30
                  days, then purged.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Erasure audit log</span> — retained
                  for 2 years. Contains only UUIDs and timestamps, no personal information.
                </li>
              </ul>
            </Section>

            {/* 6. Your Rights */}
            <Section title="6. Your Rights">
              <p>Under GDPR Articles 15 through 22, you have the right to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <span className="font-medium text-gray-800">Access</span> — request a copy of the
                  personal data we hold about you.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Rectification</span> — correct
                  inaccurate personal data.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Erasure</span> — request deletion of
                  your personal data. We process erasure requests within 7 days and provide a
                  confirmation.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Portability</span> — receive your data
                  in a structured, machine-readable format.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Object</span> — object to processing
                  of your personal data.
                </li>
                <li>
                  <span className="font-medium text-gray-800">Lodge a complaint</span> — you may
                  contact the Information Commissioner&apos;s Office (ICO) if you are in the UK, or
                  the relevant supervisory authority in your jurisdiction.
                </li>
              </ul>
              <p>
                To exercise any of these rights, email{" "}
                <a href="mailto:support@runvelo.app" className="text-primary hover:underline">
                  support@runvelo.app
                </a>
                .
              </p>
            </Section>

            {/* 7. Cookies */}
            <Section title="7. Cookies">
              <p>
                Velo uses a single session cookie to keep you signed in. This cookie is strictly
                necessary for the service to function and is exempt from consent requirements under
                ePrivacy regulations. We do not use analytics cookies, advertising cookies, or any
                third-party tracking.
              </p>
            </Section>

            {/* 8. Changes to This Policy */}
            <Section title="8. Changes to This Policy">
              <p>
                We may update this policy to reflect changes in our practices or for legal reasons.
                When we do, we will update the &ldquo;Last updated&rdquo; date at the top of this
                page. We encourage you to review this page periodically.
              </p>
            </Section>

            {/* 9. Contact */}
            <Section title="9. Contact">
              <p>
                If you have questions about this privacy policy or how we handle your data, please
                contact us:
              </p>
              <p className="flex items-center gap-2">
                <Mail size={16} className="text-gray-400" />
                <a href="mailto:support@runvelo.app" className="text-primary hover:underline">
                  support@runvelo.app
                </a>
              </p>
            </Section>
          </div>

          <div className="mt-12 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Velo Test Management
          </div>
        </div>
      </div>
    </>
  )
}
