import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsNetwork } from '../../routes/settings/network'
import { resetStore } from '../../store/lensStore'

describe('Network settings route', () => {
  beforeEach(() => {
    resetStore()
  })

  it('explains how to distinguish browser RPC connection failures', () => {
    render(<SettingsNetwork />)

    expect(
      screen.getByRole('heading', {
        name: 'Browser RPC connection troubleshooting',
      }),
    ).toBeTruthy()
    expect(
      screen.getByText(/explicit CORS or blocked-preflight message/),
    ).toBeTruthy()
    expect(
      screen.getByText(/Offline, DNS, TLS, or connection-refused errors/),
    ).toBeTruthy()
    expect(
      screen.getByText(
        /A JSON-RPC error response means the browser reached the endpoint/,
      ),
    ).toBeTruthy()
  })
})
