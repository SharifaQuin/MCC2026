import Link from "next/link";
import type { TodayCardData } from "@/lib/hrToday";
import { formatInBusinessTimezone } from "@/lib/timezone";
import { STAGE_LABELS } from "@/lib/recruiting";

function Section({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: React.ReactNode[];
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</p>
      {children.length === 0 ? (
        <p className="mt-1.5 text-sm text-neutral-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">{children}</ul>
      )}
    </div>
  );
}

// Read-only "what's on deck today" summary near the top of the Home page —
// doesn't change any data, just surfaces it with a link to go act on it.
export default function TodayCard({ data }: { data: TodayCardData }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-medium text-neutral-900">Today</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Section title="Interviews Today" emptyLabel="Nothing today">
          {data.interviews.map((i) => (
            <li key={i.applicantId} className="text-sm">
              <Link href={`/recruiting/applicants/${i.applicantId}`} className="text-brand-700 hover:underline">
                {i.name}
              </Link>
              <span className="block text-xs text-neutral-500">
                {formatInBusinessTimezone(new Date(i.scheduledAt))} PT · {STAGE_LABELS[i.stage]}
              </span>
            </li>
          ))}
        </Section>

        <Section title="Follow-Ups Due Today" emptyLabel="Nothing today">
          {data.followUpsDue.map((l) => (
            <li key={l.leadId} className="text-sm">
              <Link href={`/sales/leads/${l.leadId}`} className="text-brand-700 hover:underline">
                {l.name}
              </Link>
            </li>
          ))}
        </Section>

        <Section title="Overdue Tasks" emptyLabel="Nothing today">
          {data.overdueTasks.map((t) => (
            <li key={t.id} className="text-sm">
              <Link href="/todo" className="text-brand-700 hover:underline">
                {t.task}
              </Link>
            </li>
          ))}
        </Section>

        <Section title="Pending Payroll" emptyLabel="Nothing today">
          {data.pendingPayroll.map((p) => (
            <li key={p.entryId} className="text-sm">
              <Link href="/staff/payroll" className="text-brand-700 hover:underline">
                {p.employeeName}
              </Link>
              <span className="block text-xs text-neutral-500">{p.payPeriodLabel}</span>
            </li>
          ))}
        </Section>
      </div>
    </section>
  );
}
