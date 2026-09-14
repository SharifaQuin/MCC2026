import { submitLeadAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  incomplete: "Please fill out your name, email, and phone number.",
};

export default function LeadFormPage({
  searchParams,
}: {
  searchParams: { error?: string; src?: string };
}) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">Get a Free Cleaning Quote</h1>
      <p className="mt-2 text-neutral-600">
        Tell us a little about what you need, and someone from Mama&apos;s Cleaning Crew will
        reach out shortly.
      </p>

      {errorMessage && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <form action={submitLeadAction} className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <input type="hidden" name="src" value={searchParams.src ?? ""} />
        {/* Honeypot — hidden from real visitors via CSS, not the "hidden" attribute a bot can detect easily. */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="website">Leave this field blank</label>
          <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">First Name *</label>
            <input
              name="firstName"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Last Name *</label>
            <input
              name="lastName"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Email *</label>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Phone *</label>
            <input
              type="tel"
              name="phone"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Address</label>
          <input name="address" className="w-full rounded-md border border-neutral-300 px-3 py-2" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            What service are you interested in?
          </label>
          <input
            name="serviceInterest"
            placeholder="e.g. Standard cleaning, deep clean, move-out clean"
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Anything else we should know?
          </label>
          <textarea
            name="message"
            rows={3}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700"
        >
          Get My Free Quote
        </button>
      </form>
    </div>
  );
}
