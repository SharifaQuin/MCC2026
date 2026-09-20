import Logo from "@/components/Logo";

export const dynamic = "force-static";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200 px-4 py-4 sm:px-8">
        <Logo />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-6 text-neutral-700 sm:px-8">
        <h1 className="mb-2 text-2xl font-bold text-neutral-900">Privacy Policy</h1>
        <p className="mb-8 text-xs text-neutral-400">Last updated: September 20, 2026</p>

        <p className="mb-6">
          This Privacy Policy describes how Mama&apos;s Cleaning Crew (&quot;we,&quot; &quot;us&quot;) collects, uses, and
          protects information through our internal Owner&apos;s Dashboard (&quot;the App&quot;) and its related public
          pages (job applications, service inquiries, interview confirmations).
        </p>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">1. Who this policy covers</h2>
        <p className="mb-4">
          The App is an internal operations tool used by Mama&apos;s Cleaning Crew staff and management — it is not a
          public consumer product. This policy covers three groups of people:
        </p>
        <ul className="mb-6 list-disc space-y-1 pl-5">
          <li>Employees, trainees, trainers, and managers who have an account in the App.</li>
          <li>Job applicants who submit an application through our public careers page.</li>
          <li>Prospective customers who submit a service inquiry through our public lead form.</li>
        </ul>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">2. Information we collect</h2>
        <p className="mb-2 font-medium text-neutral-800">Employees and staff:</p>
        <p className="mb-4">
          Name, contact information, hire date, role, pay rate and pay history, training progress and
          certifications, field evaluations, attendance records, complaints and personnel records, signed onboarding
          documents, and account login information.
        </p>
        <p className="mb-2 font-medium text-neutral-800">Job applicants:</p>
        <p className="mb-4">
          Name, contact information, application answers, interview scheduling details, and interview confirmation
          status.
        </p>
        <p className="mb-2 font-medium text-neutral-800">Prospective customers (leads):</p>
        <p className="mb-4">
          Name, contact information, service interest, and property details submitted through our lead form.
        </p>
        <p className="mb-2 font-medium text-neutral-800">Financial data (owner-only):</p>
        <p className="mb-6">
          If connected, the App can pull summary Profit &amp; Loss totals (revenue, cost of goods sold, gross profit,
          operating expenses, net profit) from our QuickBooks Online account. This only happens when the business
          owner explicitly clicks &quot;Pull from QuickBooks&quot; for a specific month — it is never automatic, and it
          only retrieves top-line totals, never transaction-level detail (e.g., individual invoices, customer
          payment details, or bank account numbers).
        </p>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">3. How we use this information</h2>
        <p className="mb-4">We use the information above solely to run our business, including:</p>
        <ul className="mb-6 list-disc space-y-1 pl-5">
          <li>Managing employee training, certification, scheduling, payroll, and HR records.</li>
          <li>Evaluating and communicating with job applicants.</li>
          <li>Following up with prospective customers about service inquiries.</li>
          <li>Tracking company financial performance for internal owner/management reporting.</li>
        </ul>
        <p className="mb-6">We do not sell personal information to third parties.</p>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">4. Third-party services we use</h2>
        <p className="mb-4">
          The App integrates with a small number of third-party services to operate. Each is used only for the
          specific purpose below, and only receives the data necessary for that purpose:
        </p>
        <ul className="mb-6 list-disc space-y-1 pl-5">
          <li>
            <strong>QuickBooks Online (Intuit):</strong> to import summary financial totals into our internal
            reporting, at the owner&apos;s request only.
          </li>
          <li>
            <strong>Email and calendar (Microsoft Outlook):</strong> to send invites, confirmations, and notifications.
          </li>
          <li>
            <strong>RingCentral:</strong> to send SMS/call reminders (e.g., interview confirmations).
          </li>
          <li>
            <strong>Slack:</strong> for internal staff notifications (e.g., new leads, HR items needing attention).
          </li>
          <li>
            <strong>Zoom:</strong> for scheduling phone/video interviews.
          </li>
          <li>
            <strong>Cloudflare Turnstile:</strong> to prevent automated spam submissions on our public lead form.
          </li>
        </ul>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">5. Data storage and security</h2>
        <p className="mb-6">
          Data is stored in a private, password-protected database hosted on Railway. Access to the App requires an
          individual account, and different roles (trainee, trainer, manager, admin) are limited to only the
          information relevant to that role — for example, only company leadership can view certain HR and financial
          records.
        </p>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">6. Data retention</h2>
        <p className="mb-6">
          We retain employee, applicant, and customer records for as long as needed for business, legal, and tax
          purposes. If you are a job applicant or prospective customer and would like your information removed,
          contact us using the information below.
        </p>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">7. Changes to this policy</h2>
        <p className="mb-6">
          We may update this policy from time to time. The &quot;last updated&quot; date at the top of this page will
          reflect the most recent revision.
        </p>

        <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">8. Contact us</h2>
        <p className="mb-6">
          Questions about this policy or requests regarding your information can be sent to{" "}
          <a href="mailto:support@mamascleaningcrew.com" className="text-brand-700 underline">
            support@mamascleaningcrew.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
