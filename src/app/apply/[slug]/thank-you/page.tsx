import Logo from "@/components/Logo";

export default function ThankYouPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold text-neutral-900">
        Thanks for applying to Mama&apos;s Cleaning Crew!
      </h1>
      <p className="mt-4 text-neutral-600">
        We&apos;ve received your application and resume. If it looks like a good fit, we&apos;ll
        be in touch by phone, text, or email with next steps.
      </p>
    </div>
  );
}
