import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DecodeFallbackList } from '../../routes/contracts/$contractId/explorer'
import type { ComponentProps, ReactNode } from 'react'
import type { LedgerEntry } from '../../store/types'

vi.mock('@stellar/design-system', () => ({
  Button: (props: ComponentProps<'button'>) => <button {...props} />,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Heading: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe('Explorer decode fallback', () => {
  it('shows the decoder fallback reason beside the raw XDR', () => {
    const entry: LedgerEntry = {
      key: 'CONTRACT::Other::fallback-key',
      contractId: 'CONTRACT',
      type: 'Other',
      value: 'AAAA-invalid-xdr',
      lastModifiedLedger: 1,
      rawXdr: 'AAAA-invalid-xdr',
      decodeErrorReason: 'Malformed ScVal XDR',
    }

    render(<DecodeFallbackList entries={[entry]} />)

    expect(
      screen.getByRole('region', { name: 'Undecoded entries' }),
    ).toBeTruthy()
    expect(screen.getByText('Malformed ScVal XDR')).toBeTruthy()
    expect(screen.getByText('AAAA-invalid-xdr')).toBeTruthy()
  })
})
