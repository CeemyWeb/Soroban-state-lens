import { useLatestLedgerSequence } from '../../store/lensStore'
import ContractLookUpInput from './ContractLookUpInput'
import NetworkSelector from './NetworkSelector'

interface HeaderProp {
  handleToggle: () => void
}

export default function Header({ handleToggle }: HeaderProp) {
  const latestLedgerSequence = useLatestLedgerSequence()

  return (
    <>
      <header className="h-15 min-h-15 bg-surface-dark border-b border-border-dark flex items-center justify-between px-3 md:px-6 shrink-0 z-20">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggle}
            aria-label="Toggle ledger state sidebar"
            className="size-8 bg-primary/20 rounded flex items-center justify-center text-primary"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              view_in_ar
            </span>
          </button>
          {/* Compact logo: visible below xl */}
          <h1 className="font-mono font-bold text-white tracking-tight flex xl:hidden">
            SSL
          </h1>
          {/* Full title: visible on xl and above */}
          <h1 className="font-mono font-bold text-white hidden xl:text-lg tracking-tight xl:flex">
            SOROBAN STATE LENS
          </h1>
        </div>

        {/* Center: Search Input */}
        <div className="hidden md:flex w-full max-w-xl">
          <ContractLookUpInput />
        </div>

        {/* Right: Network Selector + Ledger Sequence */}
        <div className="flex items-center gap-3">
          {latestLedgerSequence !== null && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-background-dark border border-border-dark text-xs text-text-muted">
              <span className="material-symbols-outlined text-[14px]">
                ledger
              </span>
              <span className="font-mono">#{latestLedgerSequence}</span>
            </div>
          )}
          <NetworkSelector />
        </div>
      </header>
    </>
  )
}
