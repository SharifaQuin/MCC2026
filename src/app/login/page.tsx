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
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" withTagline />
        </div>
        <LoginForm next={searchParams.next ?? ""} labels={labels} />
      </div>
    </main>
  );
}
