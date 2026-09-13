import Link from "next/link";

// Shown on pages reached from the Training hub (Modules, My Progress,
// Glossary) only when a staff member got there via /admin — a Trainee
// browsing their own Modules/Progress/Glossary has no Training hub to
// go back to, so they never see this.
export default function BackToTraining() {
  return (
    <Link href="/admin" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
      ← Back to Training
    </Link>
  );
}
