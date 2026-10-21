import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../../components/global/Sidebar'
import { resetStore, useLensStore } from '../../store/lensStore'
import { formatContractIdShort } from '../../lib/format/formatContractIdShort'
import { NETWORK_CONFIG_STORAGE_KEY } from '../../store/persistence'
import type { LedgerEntry } from '../../store/types'

const makeEntry = (
  key: string,
  contractId: string,
  value: unknown = 'value',
): LedgerEntry => ({
  key,
  contractId,
  type: 'ContractData',
  value,
  lastModifiedLedger: 100,
})

describe('Sidebar History Panel', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    resetStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders default tree placeholder when activeNavItem is not history', () => {
    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="watchlist" />)

    expect(screen.getByText('Ledger State')).toBeTruthy()
    expect(screen.getByText('Contract_Registry')).toBeTruthy()
    expect(screen.queryByText('Capture First')).toBeNull()
  })

  it('shows a shortened active contract label in the sidebar header', () => {
    const activeContractId =
      'CDLZFC3SYQJ4S7HBE6A5PTLQO7N4M3YX2WT4EFQ4PTJX3S7PZN6MTEST'
    useLensStore.getState().setActiveContractId(activeContractId)

    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="watchlist" />)

    const label = screen.getByText(formatContractIdShort(activeContractId))
    expect(label).toBeTruthy()
    expect(label.getAttribute('title')).toBe(activeContractId)
  })

  it('hides the active contract label when no contract is active', () => {
    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="watchlist" />)

    expect(screen.queryByText('-')).toBeNull()
  })

  it('renders no active contract message when activeNavItem is history but activeContractId is null', () => {
    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)

    expect(screen.getByText('Compare History')).toBeTruthy()
    expect(screen.getByText('No Active Contract')).toBeTruthy()
    expect(screen.getByText(/Load a contract in the explorer/i)).toBeTruthy()
  })

  it('renders capture first empty state when activeContractId is set but snapshots < 2', () => {
    // Set active contract ID
    useLensStore.getState().setActiveContractId('c1')

    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)

    expect(screen.getByText('Compare History')).toBeTruthy()
    expect(screen.getByText('Capture First')).toBeTruthy()
    expect(screen.getByText(/No history comparison available/i)).toBeTruthy()
    expect(screen.getByText('0 / 2')).toBeTruthy()
  })

  it('allows capturing snapshot when ledger entries are loaded', () => {
    const state = useLensStore.getState()
    state.setActiveContractId('c1')

    // Mock loaded ledger entries in store
    state.upsertLedgerEntries([
      makeEntry('key1', 'c1', 'val1'),
      makeEntry('key2', 'c1', 'val2'),
    ])

    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)

    const captureButton = screen.getByRole('button', {
      name: /Capture Snapshot/i,
    })
    expect(captureButton).toBeTruthy()
    expect(captureButton.hasAttribute('disabled')).toBe(false)

    // Capture first snapshot
    fireEvent.click(captureButton)
    expect(screen.getByText('1 / 2')).toBeTruthy()

    // Capture second snapshot (which triggers diff view)
    fireEvent.click(captureButton)

    // Now it should show Diff Summary instead of Capture First
    expect(screen.queryByText('Capture First')).toBeNull()
    expect(screen.getByText('Diff Summary')).toBeTruthy()
  })

  it('warns when a capture stays in memory after browser storage fails', () => {
    const state = useLensStore.getState()
    state.setActiveContractId('c1')
    state.upsertLedgerEntries([makeEntry('key1', 'c1', 'value')])

    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    fireEvent.click(screen.getByRole('button', { name: /Capture Snapshot/i }))

    expect(useLensStore.getState().getSnapshots('c1')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toContain(
      'Reloading will discard them.',
    )
  })

  it('captures with Ctrl or Command+Shift+S but ignores editable controls', () => {
    const state = useLensStore.getState()
    state.setActiveContractId('c1')
    state.upsertLedgerEntries([makeEntry('key1', 'c1', 'value')])
    render(
      <>
        <input aria-label="Editable field" />
        <Sidebar open={false} onClose={vi.fn()} activeNavItem="watchlist" />
      </>,
    )

    fireEvent.keyDown(screen.getByLabelText('Editable field'), {
      key: 's',
      ctrlKey: true,
      shiftKey: true,
    })
    expect(useLensStore.getState().getSnapshots('c1')).toHaveLength(0)

    fireEvent.keyDown(document, { key: 's', metaKey: true, shiftKey: true })
    expect(useLensStore.getState().getSnapshots('c1')).toHaveLength(1)
  })

  it('displays counts for created, deleted, modified, and unchanged entries', () => {
    const state = useLensStore.getState()
    state.setActiveContractId('c1')

    // Snapshot 1 entries
    const snap1 = {
      key_unchanged: makeEntry('key_unchanged', 'c1', 'same'),
      key_modified: makeEntry('key_modified', 'c1', 'old_val'),
      key_deleted: makeEntry('key_deleted', 'c1', 'gone'),
    }

    // Snapshot 2 entries
    const snap2 = {
      key_unchanged: makeEntry('key_unchanged', 'c1', 'same'),
      key_modified: makeEntry('key_modified', 'c1', 'new_val'),
      key_created: makeEntry('key_created', 'c1', 'newly_created'),
    }

    // Programmatically add snapshots
    state.addSnapshot('c1', snap1, 12345, 'Snapshot #1')
    state.addSnapshot('c1', snap2, 12346, 'Snapshot #2')

    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)

    expect(screen.getByText('Diff Summary')).toBeTruthy()
    expect(screen.getAllByText('Snapshot #1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Snapshot #2').length).toBeGreaterThan(0)

    // Verify diff counts
    // Created should be 1 (+1)
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByText('Created')).toBeTruthy()

    // Deleted should be 1 (-1)
    expect(screen.getByText('-1')).toBeTruthy()
    expect(screen.getByText('Deleted')).toBeTruthy()

    // Modified should be 1 (~1)
    expect(screen.getByText('~1')).toBeTruthy()
    expect(screen.getByText('Modified')).toBeTruthy()

    // Unchanged should be 1
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('Unchanged')).toBeTruthy()
  })

  it('updates the diff summary when an older snapshot pair is selected', () => {
    const state = useLensStore.getState()
    state.setActiveContractId('c1')
    state.addSnapshot('c1', { key: makeEntry('key', 'c1', 'same') }, 1, 'Older')
    state.addSnapshot(
      'c1',
      { key: makeEntry('key', 'c1', 'same') },
      2,
      'Middle',
    )
    state.addSnapshot(
      'c1',
      { key: makeEntry('key', 'c1', 'changed') },
      3,
      'Latest',
    )

    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)

    expect(screen.getByText('~1')).toBeTruthy()
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Compare from snapshot' }),
      {
        target: { value: useLensStore.getState().getSnapshots('c1')[0]?.id },
      },
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Compare to snapshot' }),
      {
        target: { value: useLensStore.getState().getSnapshots('c1')[1]?.id },
      },
    )

    expect(screen.getAllByText('Older').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Middle').length).toBeGreaterThan(0)
    expect(screen.getByText('~0')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('downloads the 42-to-43 diff after snapshots are rehydrated', async () => {
    const state = useLensStore.getState()
    state.addSnapshot('c1', { key: makeEntry('key', 'c1', 42) }, 42, 'Before')
    state.addSnapshot('c1', { key: makeEntry('key', 'c1', 43) }, 43, 'After')
    const savedState = localStorage.getItem(NETWORK_CONFIG_STORAGE_KEY)
    expect(savedState).not.toBeNull()

    resetStore()
    if (savedState === null) throw new Error('Snapshots were not persisted')
    localStorage.setItem(NETWORK_CONFIG_STORAGE_KEY, savedState)
    await useLensStore.persist.rehydrate()
    useLensStore.getState().setActiveContractId('c1')

    let downloadedBlob:
      | { type: string; text: () => Promise<string> }
      | undefined
    vi.stubGlobal(
      'Blob',
      class {
        type: string
        private readonly content: Array<string | BlobPart>

        constructor(
          content: Array<string | BlobPart>,
          options: { type: string },
        ) {
          this.content = content
          this.type = options.type
        }

        text() {
          return Promise.resolve(this.content.join(''))
        }
      },
    )
    const createObjectURLDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      'createObjectURL',
    )
    const revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      'revokeObjectURL',
    )
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: { type: string; text: () => Promise<string> }) => {
        downloadedBlob = blob
        return 'blob:download'
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    const linkClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    try {
      render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Download snapshot diff as JSON' }),
      )

      expect(linkClick).toHaveBeenCalledOnce()
      expect(downloadedBlob?.type).toBe('application/json')
      const exported = JSON.parse(await downloadedBlob!.text()) as {
        diff: Array<{
          prevEntry: { value: unknown }
          nextEntry: { value: unknown }
        }>
        summary: { modified: number }
      }
      expect(exported.summary.modified).toBe(1)
      expect(exported.diff).toContainEqual(
        expect.objectContaining({
          prevEntry: expect.objectContaining({ value: 42 }),
          nextEntry: expect.objectContaining({ value: 43 }),
        }),
      )
    } finally {
      if (createObjectURLDescriptor) {
        Object.defineProperty(URL, 'createObjectURL', createObjectURLDescriptor)
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL')
      }
      if (revokeObjectURLDescriptor) {
        Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURLDescriptor)
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL')
      }
    }
  })

  it('blocks comparison and export when either selected snapshot is incomplete', () => {
    const state = useLensStore.getState()
    state.setActiveContractId('c1')
    state.addSnapshot(
      'c1',
      { key: makeEntry('key', 'c1', 'before') },
      1,
      'Damaged',
    )
    state.addSnapshot(
      'c1',
      { key: makeEntry('key', 'c1', 'after') },
      2,
      'Valid',
    )
    const networkId = state.networkConfig.networkId
    const snapshots = useLensStore
      .getState()
      .getSnapshots('c1')
      .map((snapshot, index) =>
        index === 0 ? { ...snapshot, incomplete: true } : snapshot,
      )
    useLensStore.setState((current) => ({
      snapshots: {
        ...current.snapshots,
        [networkId]: { ...current.snapshots[networkId], c1: snapshots },
      },
    }))

    render(<Sidebar open={true} onClose={vi.fn()} activeNavItem="history" />)

    expect(screen.getByRole('alert').textContent).toContain(
      'Damaged has rejected entries. Recapture this snapshot before comparing.',
    )
    expect(screen.queryByText('~0')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Download snapshot diff as JSON' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
})
