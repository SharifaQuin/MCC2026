import SetPasswordForm from "./SetPasswordForm";
import Logo from "@/components/Logo";

export default function InvitePage({ params }: { params: { token: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" withTagline />
        </div>
        <p className="mb-6 text-center text-sm text-neutral-500">
          Set a password to activate your training account.
        </p>
        <SetPasswordForm token={params.token} />
      </div>
    </main>
  );
}
