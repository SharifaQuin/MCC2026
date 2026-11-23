import LoginForm from "./LoginForm";
import { dictionary } from "@/lib/i18n";
import Logo from "@/components/Logo";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const labels = dictionary.EN;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-600 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Logo iconOnly />
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold tracking-tight text-white">Mama&apos;s Cleaning Crew</p>
          <p className="mt-1 text-sm font-medium uppercase tracking-wide text-gold-400">Team Portal</p>
        </div>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <LoginForm next={searchParams.next ?? ""} labels={labels} />
      </div>
    </main>
  );
}
