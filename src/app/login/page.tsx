import LoginForm from "./LoginForm";
import { dictionary } from "@/lib/i18n";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const labels = dictionary.EN;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">{labels.appName}</h1>
        <p className="mb-6 text-sm text-neutral-500">Mama&apos;s Cleaning Crew</p>
        <LoginForm next={searchParams.next ?? ""} labels={labels} />
      </div>
    </main>
  );
}
