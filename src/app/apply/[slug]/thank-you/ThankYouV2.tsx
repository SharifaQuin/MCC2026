import Logo from "@/components/Logo";

// Deliberately does not promise an interview or reveal internal scoring —
// every candidate who submits sees this exact, neutral message regardless
// of their prescreen result.
export default function ThankYouV2() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <Logo />
      <h1 className="mt-6 text-2xl font-bold text-brand-800">Thank You for Applying! 💙</h1>
      <p className="mt-4 text-neutral-700">We&apos;ve received your application for Mama&apos;s Cleaning Crew.</p>
      <p className="mt-3 text-sm text-neutral-600">
        Our team reviews applications based on the requirements of the position as well as the
        information you&apos;ve shared with us.
      </p>
      <p className="mt-3 text-sm text-neutral-600">
        If you&apos;re selected to move forward, we&apos;ll contact you with information about the next
        step.
      </p>
      <p className="mt-3 text-sm text-neutral-600">
        Please keep an eye on your phone, text messages, and email so you don&apos;t miss an update from
        Mama&apos;s Cleaning Crew.
      </p>
      <p className="mt-4 font-medium text-brand-700">We&apos;re excited to learn more about you!</p>
    </div>
  );
}
