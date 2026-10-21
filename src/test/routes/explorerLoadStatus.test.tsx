import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContractLoadStatusAnnouncement } from '../../routes/contracts/$contractId/explorer'
import { ContractLoadStatus } from '../../store/types'

vi.mock('@stellar/design-system', () => ({
  Button: () => null,
  Card: () => null,
  Heading: () => null,
}))

describe('Explorer load status announcement', () => {
  it('politely announces loading, empty, success, and error states', () => {
    const { rerender } = render(
      <ContractLoadStatusAnnouncement
        status={ContractLoadStatus.LOADING}
        error={null}
        ledgerEntryCount={0}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Loading contract data.',
    )

    rerender(
      <ContractLoadStatusAnnouncement
        status={ContractLoadStatus.EMPTY}
        error={null}
        ledgerEntryCount={0}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'No contract data found.',
    )

    rerender(
      <ContractLoadStatusAnnouncement
        status={ContractLoadStatus.SUCCESS}
        error={null}
        ledgerEntryCount={1}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Contract data loaded. 1 ledger entry found.',
    )

    rerender(
      <ContractLoadStatusAnnouncement
        status={ContractLoadStatus.ERROR}
        error="RPC unavailable"
        ledgerEntryCount={0}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Failed to load contract data. RPC unavailable',
    )
  })
})
