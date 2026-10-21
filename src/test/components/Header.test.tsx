import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Header from '../../components/global/Header'
import { DEFAULT_NETWORKS } from '../../store/types'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const mockUseLatestLedgerSequence = vi.fn()

vi.mock('../../store/lensStore', () => ({
  useLatestLedgerSequence: () => mockUseLatestLedgerSequence(),
  useLensStore: ((selector: (state: unknown) => unknown) => {
    const state = {
      networkConfig: DEFAULT_NETWORKS.testnet,
      lastCustomUrl: undefined,
      setNetworkConfig: vi.fn(),
      setLastCustomUrl: vi.fn(),
      setLatestLedgerSequence: vi.fn(),
    }
    return selector(state)
  }) as never,
}))

describe('Header sidebar toggle', () => {
  it('has an accessible name and explicit button type', () => {
    mockUseLatestLedgerSequence.mockReturnValue(null)
    render(<Header handleToggle={vi.fn()} />)

    const toggle = screen.getByRole('button', {
      name: 'Toggle ledger state sidebar',
    })
    expect(toggle.getAttribute('type')).toBe('button')
    expect(toggle.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})

describe('Header ledger sequence display', () => {
  it('displays ledger sequence when available', () => {
    mockUseLatestLedgerSequence.mockReturnValue(12345)
    render(<Header handleToggle={vi.fn()} />)

    const ledgerDisplay = screen.getByText('#12345')
    expect(ledgerDisplay).toBeTruthy()
  })

  it('does not display ledger sequence when null', () => {
    mockUseLatestLedgerSequence.mockReturnValue(null)
    render(<Header handleToggle={vi.fn()} />)

    const ledgerDisplay = screen.queryByText(/#\d+/)
    expect(ledgerDisplay).toBeNull()
  })

  it('updates ledger sequence when value changes', () => {
    const { rerender } = render(<Header handleToggle={vi.fn()} />)

    mockUseLatestLedgerSequence.mockReturnValue(100)
    rerender(<Header handleToggle={vi.fn()} />)

    expect(screen.getByText('#100')).toBeTruthy()

    mockUseLatestLedgerSequence.mockReturnValue(200)
    rerender(<Header handleToggle={vi.fn()} />)

    expect(screen.getByText('#200')).toBeTruthy()
    expect(screen.queryByText('#100')).toBeNull()
  })
})
