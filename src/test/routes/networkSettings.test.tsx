import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NetworkSelector from '../../components/global/NetworkSelector'
import { SettingsNetwork } from '../../routes/settings/network'
import { resetStore, useLensStore } from '../../store/lensStore'

const clipboardWriteText = vi.fn().mockResolvedValue(undefined)

describe('network settings', () => {
  beforeEach(() => {
    resetStore()
    clipboardWriteText.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
  })

  it('shows a canonical RPC URL and classifies presets by network ID', () => {
    useLensStore.getState().setNetworkConfig({
      networkId: 'testnet',
      rpcUrl: '  https://custom-format.example/rpc///  ',
    })

    render(<SettingsNetwork />)

    expect(screen.getByText('Preset Network')).toBeTruthy()
    expect(screen.getByText('https://custom-format.example/rpc')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
    const testnetPreset = screen
      .getAllByText('testnet')
      .find((element) => element.className.includes('capitalize'))
    expect(testnetPreset?.closest('div.rounded.border')?.className).toContain(
      'bg-blue-900',
    )
  })

  it('copies the displayed RPC URL and passphrase with status feedback', async () => {
    useLensStore.getState().setNetworkConfig({
      networkId: 'custom',
      rpcUrl: 'https://rpc.custom.example.com/',
      networkPassphrase: 'Custom network passphrase',
    })

    render(<SettingsNetwork />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy RPC URL' }))
    expect(clipboardWriteText).toHaveBeenCalledWith(
      'https://rpc.custom.example.com',
    )
    expect((await screen.findByRole('status')).textContent).toContain(
      'Copied RPC URL',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy network passphrase' }),
    )
    expect(clipboardWriteText).toHaveBeenLastCalledWith(
      'Custom network passphrase',
    )
    expect((await screen.findByRole('status')).textContent).toContain(
      'Copied network passphrase',
    )
  })

  it('requires a nonblank custom network passphrase before applying', () => {
    render(<NetworkSelector />)

    fireEvent.click(screen.getByRole('button', { name: 'Select network' }))
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }))

    const passphraseInput = screen.getByRole('textbox', {
      name: 'Custom Network Passphrase input',
    })
    const applyButton = screen.getByRole('button', { name: 'Apply' })

    expect(screen.getByText('Network passphrase is required.')).toBeTruthy()
    expect(applyButton).toHaveProperty('disabled', true)

    fireEvent.change(passphraseInput, { target: { value: '  ' } })
    expect(applyButton).toHaveProperty('disabled', true)

    fireEvent.change(passphraseInput, {
      target: { value: 'New custom passphrase' },
    })
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Custom RPC URL input' }),
      {
        target: { value: '  https://rpc.custom.example.com/  ' },
      },
    )
    expect(applyButton).toHaveProperty('disabled', false)
    fireEvent.click(applyButton)

    expect(useLensStore.getState().networkConfig).toMatchObject({
      networkId: 'custom',
      rpcUrl: 'https://rpc.custom.example.com/',
      networkPassphrase: 'New custom passphrase',
    })
  })
})
