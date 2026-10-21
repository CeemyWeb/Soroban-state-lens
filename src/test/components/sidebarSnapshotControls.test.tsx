import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Sidebar from '../../components/global/Sidebar'
import { resetStore, useLensStore } from '../../store/lensStore'

const contractId = 'CABC123'

describe('Sidebar snapshot controls', () => {
  beforeEach(() => {
    resetStore()
    const store = useLensStore.getState()
    store.setActiveContractId(contractId)
    store.addSnapshot(contractId, {}, 1, 'First snapshot')
    store.addSnapshot(contractId, {}, 2, 'Second snapshot')
  })

  it('gives destructive snapshot controls names with their target identity', () => {
    render(
      <Sidebar
        open
        onClose={() => {}}
        variant="pinned"
        activeNavItem="history"
      />,
    )

    expect(
      screen.getByRole('button', {
        name: `Clear all snapshots for ${contractId}`,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: `Delete snapshot First snapshot for ${contractId}`,
      }),
    ).toBeTruthy()
  })

  it('keeps a snapshot when its deletion is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <Sidebar
        open
        onClose={() => {}}
        variant="pinned"
        activeNavItem="history"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: `Delete snapshot First snapshot for ${contractId}`,
      }),
    )

    expect(useLensStore.getState().getSnapshots(contractId)).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('deletes only the confirmed snapshot', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <Sidebar
        open
        onClose={() => {}}
        variant="pinned"
        activeNavItem="history"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: `Delete snapshot First snapshot for ${contractId}`,
      }),
    )

    const snapshots = useLensStore.getState().getSnapshots(contractId)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.label).toBe('Second snapshot')
    vi.restoreAllMocks()
  })
})
