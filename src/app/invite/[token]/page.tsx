import SetPasswordForm from "./SetPasswordForm";

export default function InvitePage({ params }: { params: { token: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Welcome to MCC</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Set a password to activate your training account.
        </p>
        <SetPasswordForm token={params.token} />
      </div>
    </main>
  );
}
