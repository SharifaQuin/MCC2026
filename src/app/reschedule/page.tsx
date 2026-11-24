import Logo from "@/components/Logo";
import RescheduleRequestForm from "./RescheduleRequestForm";
import { getPublicOpenOptions } from "@/lib/slotCapacitySummary";

// Open options must be built fresh on every load (the brief's own words:
// "Server-built each load") — without this, Next.js statically prerenders
// this page at build time (no headers()/cookies()/searchParams to force
// dynamic rendering automatically) and would otherwise bake in whatever
// openings existed then, forever.
export const dynamic = "force-dynamic";

export default async function ReschedulePage() {
  const options = await getPublicOpenOptions(5);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" withTagline />
        </div>
        <RescheduleRequestForm options={options} turnstileSiteKey={turnstileSiteKey} />
      </div>
    </main>
  );
}
