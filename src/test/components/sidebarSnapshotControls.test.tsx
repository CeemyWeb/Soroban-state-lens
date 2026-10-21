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

  it('announces the label of a successfully captured snapshot', () => {
    useLensStore.getState().upsertLedgerEntry({
      key: `${contractId}::ContractData::key`,
      contractId,
      type: 'ContractData',
      value: 'value',
      lastModifiedLedger: 1,
    })
    render(
      <Sidebar
        open
        onClose={() => {}}
        variant="pinned"
        activeNavItem="history"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }))

    expect(screen.getByRole('status').textContent).toBe('Captured Snapshot #3.')
    expect(useLensStore.getState().getSnapshots(contractId).at(-1)?.label).toBe(
      'Snapshot #3',
    )
  })

  it('announces why capture is unavailable when no entries are loaded', () => {
    render(
      <Sidebar
        open
        onClose={() => {}}
        variant="pinned"
        activeNavItem="history"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Capture' }))

    expect(screen.getByRole('status').textContent).toContain(
      'No snapshot captured: query keys and load contract entries successfully',
    )
    expect(useLensStore.getState().getSnapshots(contractId)).toHaveLength(2)
  })

  it('filters tree placeholders from the filter control', () => {
    render(
      <Sidebar
        open
        onClose={() => {}}
        variant="pinned"
        activeNavItem="explorer"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Filter ledger entries' }),
      {
        target: { value: 'WASM' },
      },
    )

    expect(screen.getByText('WASM_Cache')).toBeTruthy()
    expect(screen.queryByText('Contract_Registry')).toBeNull()
  })

  it('collapses expanded tree placeholders', () => {
    const store = useLensStore.getState()
    store.toggleExpanded('sidebar:contract-registry')
    store.toggleExpanded('sidebar:wasm-cache')

    render(
      <Sidebar
        open
        onClose={() => {}}
        variant="pinned"
        activeNavItem="explorer"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))

    expect(useLensStore.getState().expandedNodes).toEqual([])
  })
})
