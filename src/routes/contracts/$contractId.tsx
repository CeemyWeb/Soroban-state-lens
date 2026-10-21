import { useEffect } from 'react'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { isSampleContractId } from '../../lib/demoContract'
import { getStoreState } from '../../store/lensStore'

export const Route = createFileRoute('/contracts/$contractId')({
  component: ContractLayoutRoute,
})

export function clearActiveContractContext(): void {
  const state = getStoreState()
  state.clearActiveContractId()
  state.clearSelectedKeyPath()
}

export function ContractLayoutRoute() {
  const { contractId } = Route.useParams()

  useEffect(() => {
    return () => {
      clearActiveContractContext()
    }
  }, [])

  return (
    <>
      <nav
        aria-label="Contract sections"
        className="flex flex-wrap gap-2 px-6 pt-4 lg:px-10"
      >
        <Link
          to="/contracts/$contractId/explorer"
          params={{ contractId }}
          search={{
            keys: '',
            mode: isSampleContractId(contractId) ? 'demo' : 'live',
          }}
          activeProps={{ 'aria-current': 'page' }}
          className="rounded px-3 py-2 text-sm text-text-muted hover:text-white"
        >
          Explorer
        </Link>
        <Link
          to="/contracts/$contractId/discovery"
          params={{ contractId }}
          activeProps={{ 'aria-current': 'page' }}
          className="rounded px-3 py-2 text-sm text-text-muted hover:text-white"
        >
          Discovery
        </Link>
        <Link
          to="/contracts/$contractId/history"
          params={{ contractId }}
          activeProps={{ 'aria-current': 'page' }}
          className="rounded px-3 py-2 text-sm text-text-muted hover:text-white"
        >
          History
        </Link>
        <Link
          to="/contracts/$contractId/watchlist"
          params={{ contractId }}
          activeProps={{ 'aria-current': 'page' }}
          className="rounded px-3 py-2 text-sm text-text-muted hover:text-white"
        >
          Watchlist
        </Link>
      </nav>
      <Outlet />
    </>
  )
}
