import { prisma } from "@/lib/prisma";
import { getLeadFormConfig, LEAD_SERVICE_OPTIONS, LEAD_HOW_HEARD_OPTIONS, guessHowHeardFromSrc } from "@/lib/leads";
import { submitLeadAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  incomplete: "Please fill out your name, email, phone number, and every required field.",
  captcha: "Please complete the verification checkbox and try again.",
};

export default async function LeadFormPage({
  searchParams,
}: {
  searchParams: { error?: string; src?: string };
}) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
  const [config, fields] = await Promise.all([
    getLeadFormConfig(),
    prisma.leadFormField.findMany({ orderBy: { order: "asc" } }),
  ]);
  const defaultHowHeard = guessHowHeardFromSrc(searchParams.src) ?? "";

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">{config.headline}</h1>
      <p className="mt-2 text-neutral-600">{config.intro}</p>

      {errorMessage && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <form action={submitLeadAction} className="relative mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
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

        {config.addressEnabled && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {config.addressLabel}
              {config.addressRequired ? " *" : ""}
            </label>
            <input
              name="address"
              required={config.addressRequired}
              placeholder="e.g. 123 Main St, Irvine, CA 92618"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Please include the city and zip code — helps us prepare an accurate quote.
            </p>
          </div>
        )}

        {config.serviceInterestEnabled && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {config.serviceInterestLabel}
                {config.serviceInterestRequired ? " *" : ""}
              </label>
              <select
                name="serviceInterest"
                required={config.serviceInterestRequired}
                defaultValue=""
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              >
                <option value="" disabled>
                  Select a service...
                </option>
                {LEAD_SERVICE_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                    {s.minPrice ? ` (starts at $${s.minPrice})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Approximate Square Footage *
              </label>
              <input
                type="number"
                name="squareFootage"
                min={1}
                step={10}
                placeholder="e.g. 1800"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Helps us give you a more accurate quote.
              </p>
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            How did you hear about us? *
          </label>
          <select
            name="howHeard"
            required
            defaultValue={defaultHowHeard}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="" disabled>
              Select one...
            </option>
            {LEAD_HOW_HEARD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {config.messageEnabled && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {config.messageLabel}
              {config.messageRequired ? " *" : ""}
            </label>
            <textarea
              name="message"
              rows={3}
              required={config.messageRequired}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
        )}

        {fields.map((field) => (
          <div key={field.id}>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {field.label}
              {field.required ? " *" : ""}
            </label>
            {field.fieldType === "TEXTAREA" ? (
              <textarea
                name={`custom_${field.id}`}
                placeholder={field.placeholder ?? ""}
                required={field.required}
                rows={3}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            ) : field.fieldType === "SELECT" ? (
              <select
                name={`custom_${field.id}`}
                required={field.required}
                defaultValue=""
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              >
                <option value="" disabled>
                  {field.placeholder || "Select..."}
                </option>
                {(field.options ?? "")
                  .split("\n")
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                name={`custom_${field.id}`}
                placeholder={field.placeholder ?? ""}
                required={field.required}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            )}
          </div>
        ))}

        {turnstileSiteKey && <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />}

        <button
          type="submit"
          className="w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700"
        >
          {config.submitLabel}
        </button>
      </form>

      {turnstileSiteKey && (
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}
    </div>
  );
}
