"use client";

import { useState, useTransition } from "react";
import { closeLoanAction, reopenLoanAction, updateLoanBalanceAction } from "@/app/actions/financials";
import { estimateLoanPayoff, FREQUENCY_LABELS } from "@/lib/loans";

export interface LoanRow {
  id: string;
  lender: string;
  loanType: string | null;
  status: "OPEN" | "CLOSED";
  originationDate: string | null;
  closedDate: string | null;
  loanAmount: number | null;
  feeAmount: number | null;
  totalToRepay: number | null;
  repaymentRatePct: number | null;
  minimumPayment: number | null;
  minimumPaymentFrequency: string | null;
  maturityDate: string | null;
  currentBalance: number | null;
  currentBalanceAsOf: string | null;
  notes: string | null;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateStr = (d: string) => new Date(d).toLocaleDateString();

function LoanRowView({ loan }: { loan: LoanRow }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState(String(loan.currentBalance ?? ""));
  const [paymentDraft, setPaymentDraft] = useState(String(loan.minimumPayment ?? ""));
  const [frequencyDraft, setFrequencyDraft] = useState(loan.minimumPaymentFrequency ?? "");

  const payoff =
    loan.status === "OPEN"
      ? estimateLoanPayoff({
          currentBalance: loan.currentBalance,
          minimumPayment: loan.minimumPayment,
          minimumPaymentFrequency: loan.minimumPaymentFrequency,
        })
      : null;

  function saveBalance() {
    const fd = new FormData();
    fd.set("currentBalance", balanceDraft);
    fd.set("minimumPayment", paymentDraft);
    fd.set("minimumPaymentFrequency", frequencyDraft);
    startTransition(() => {
      updateLoanBalanceAction(loan.id, fd);
    });
  }

  function close() {
    if (!confirm(`Mark "${loan.lender}" as closed (paid off)?`)) return;
    startTransition(() => {
      closeLoanAction(loan.id);
    });
  }

  function reopen() {
    startTransition(() => {
      reopenLoanAction(loan.id);
    });
  }

  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((s) => !s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((s) => !s);
        }}
        className="flex cursor-pointer items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">{loan.lender}</p>
          {loan.status === "OPEN" ? (
            <p className="mt-0.5 text-xs text-neutral-500">
              {loan.currentBalance !== null ? `${money(loan.currentBalance)} owed` : "Balance not set"}
              {payoff && payoff.periodsRemaining > 0 && (
                <> · est. payoff {dateStr(payoff.expectedPayoffDate.toISOString())}</>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-neutral-500">
              Closed{loan.closedDate ? ` ${dateStr(loan.closedDate)}` : ""}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            loan.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {loan.status === "OPEN" ? "Open" : "Closed"}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {loan.loanAmount !== null && (
              <>
                <dt>Original amount</dt>
                <dd className="text-right text-neutral-800">{money(loan.loanAmount)}</dd>
              </>
            )}
            {loan.feeAmount !== null && (
              <>
                <dt>Fee</dt>
                <dd className="text-right text-neutral-800">{money(loan.feeAmount)}</dd>
              </>
            )}
            {loan.totalToRepay !== null && (
              <>
                <dt>Total to repay</dt>
                <dd className="text-right text-neutral-800">{money(loan.totalToRepay)}</dd>
              </>
            )}
            {loan.repaymentRatePct !== null && (
              <>
                <dt>Repayment rate</dt>
                <dd className="text-right text-neutral-800">{loan.repaymentRatePct}% of daily sales</dd>
              </>
            )}
            {loan.originationDate && (
              <>
                <dt>Originated</dt>
                <dd className="text-right text-neutral-800">{dateStr(loan.originationDate)}</dd>
              </>
            )}
            {loan.maturityDate && (
              <>
                <dt>Maturity date</dt>
                <dd className="text-right text-neutral-800">{dateStr(loan.maturityDate)}</dd>
              </>
            )}
            {loan.currentBalanceAsOf && (
              <>
                <dt>Balance as of</dt>
                <dd className="text-right text-neutral-800">{dateStr(loan.currentBalanceAsOf)}</dd>
              </>
            )}
          </dl>

          {loan.notes && <p className="italic text-neutral-500">{loan.notes}</p>}

          {loan.status === "OPEN" ? (
            <div onClick={(e) => e.stopPropagation()} className="space-y-2 rounded-md bg-neutral-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Current balance</label>
                  <input
                    type="number"
                    step="0.01"
                    value={balanceDraft}
                    onChange={(e) => setBalanceDraft(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Payment amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentDraft}
                    onChange={(e) => setPaymentDraft(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Payment frequency</label>
                <select
                  value={frequencyDraft}
                  onChange={(e) => setFrequencyDraft(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                >
                  <option value="">—</option>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={saveBalance}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  {pending ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={close}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-white disabled:opacity-40"
                >
                  Mark as closed
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={reopen}
              className="text-xs text-brand-700 hover:underline disabled:opacity-40"
            >
              Reopen this loan
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LoansManager({ loans }: { loans: LoanRow[] }) {
  const [showClosed, setShowClosed] = useState(false);
  const open = loans.filter((l) => l.status === "OPEN");
  const closed = loans.filter((l) => l.status === "CLOSED");

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
        {open.length === 0 ? (
          <p className="text-sm text-neutral-400">No open loans.</p>
        ) : (
          open.map((l) => <LoanRowView key={l.id} loan={l} />)
        )}
      </div>

      {closed.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <button
            type="button"
            onClick={() => setShowClosed((s) => !s)}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-700"
          >
            {showClosed ? "Hide" : "Show"} closed loans ({closed.length})
          </button>
          {showClosed && (
            <div className="mt-2 grid gap-3 opacity-70 md:grid-cols-2">
              {closed.map((l) => (
                <LoanRowView key={l.id} loan={l} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
