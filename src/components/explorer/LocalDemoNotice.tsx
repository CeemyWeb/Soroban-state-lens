export function LocalDemoNotice() {
  return (
    <p
      role="note"
      aria-label="Local demo data. Ledger numbers are illustrative."
      className="flex items-center gap-2 text-xs text-amber-300"
    >
      <span className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono font-bold uppercase tracking-wider">
        Local demo
      </span>
      <span>Ledger numbers are illustrative.</span>
    </p>
  )
}
