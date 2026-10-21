import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from '../../routeTree.gen'
import { resetStore, useLensStore } from '../../store/lensStore'

vi.mock('@stellar/design-system', () => ({
  Button: (props: any) => <button {...props} />,
  Card: (props: any) => <div {...props}>{props.children}</div>,
  Heading: (props: any) => <div {...props}>{props.children}</div>,
}))

const VALID_CONTRACT_ID =
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

function createTestRouter() {
  return createRouter({
    routeTree,
    context: {},
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
  })
}

describe('Watchlist route', () => {
  beforeEach(() => {
    resetStore()
  })

  it('renders an empty state when no watchlist items exist for the contract', async () => {
    window.history.pushState(
      {},
      '',
      `/contracts/${VALID_CONTRACT_ID}/watchlist`,
    )

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('No saved watchlist items')).toBeTruthy()
    expect(
      screen.getByText(/You do not have any pinned keys for this contract yet/),
    ).toBeTruthy()

    const sectionNav = screen.getByRole('navigation', {
      name: 'Contract sections',
    })
    expect(sectionNav.querySelectorAll('a')).toHaveLength(4)
    expect(
      screen.getByRole('link', { name: 'Explorer' }).getAttribute('href'),
    ).toBe(`/contracts/${VALID_CONTRACT_ID}/explorer?keys=`)
    expect(
      screen.getByRole('link', { name: 'Discovery' }).getAttribute('href'),
    ).toBe(`/contracts/${VALID_CONTRACT_ID}/discovery`)
    expect(
      screen.getByRole('link', { name: 'History' }).getAttribute('href'),
    ).toBe(`/contracts/${VALID_CONTRACT_ID}/history`)
    expect(
      screen
        .getByRole('link', { name: 'Watchlist' })
        .getAttribute('aria-current'),
    ).toBe('page')
  })

  it('renders saved watchlist items and an inspect action', async () => {
    useLensStore.getState().addToWatchlist(VALID_CONTRACT_ID, '/test/key')
    window.history.pushState(
      {},
      '',
      `/contracts/${VALID_CONTRACT_ID}/watchlist`,
    )

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('/test/key')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeTruthy()
  })

  it('uses the normalized contract ID for watchlist reads and removals', async () => {
    useLensStore.getState().addToWatchlist(VALID_CONTRACT_ID, '/test/key')
    const paddedRouteParam = `  ${VALID_CONTRACT_ID.toLowerCase()}  `
    window.history.pushState({}, '', `/contracts/${paddedRouteParam}/watchlist`)

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('/test/key')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(
      useLensStore.getState().watchlist.futurenet?.[VALID_CONTRACT_ID],
    ).toBeUndefined()
  })
})
