import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VirtualizedTreeList } from '../../components/explorer/VirtualizedTreeList'
import type { FlatTreeRow } from '../../lib/tree/flatTreeRow'
import type { Node } from '../../types/node'

const node: Node = {
  kind: 'primitive',
  path: [],
  scType: 'string',
  value: 'x',
  raw: { switch: 'ScvString' },
}

function rows(count: number): Array<FlatTreeRow> {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    parentId: null,
    depth: 0,
    keyPath: `row-${index}`,
    label: `row-${index}`,
    kind: 'primitive',
    hasChildren: false,
    childCount: 0,
    node,
  }))
}

describe('VirtualizedTreeList', () => {
  it('exposes the explorer rows as treeitems with their nested levels', () => {
    const nestedRows = rows(2)
    nestedRows[1] = { ...nestedRows[1], depth: 2 }

    render(<VirtualizedTreeList rows={nestedRows} selectedRowId="row-0" />)

    const tree = screen.getByRole('tree', { name: 'Contract state' })
    const treeitems = within(tree).getAllByRole('treeitem')

    expect(
      treeitems.map((treeitem) => treeitem.getAttribute('aria-level')),
    ).toEqual(['1', '3'])
    expect(treeitems[0]?.getAttribute('aria-selected')).toBe('true')
  })

  it('renders only visible slice', () => {
    render(
      <VirtualizedTreeList
        rows={rows(100)}
        height={120}
        rowHeight={30}
        overscan={1}
      />,
    )

    const mounted = screen.getAllByTestId('virtualized-tree-row')
    expect(mounted.length).toBeLessThan(20)
    expect(mounted.length).toBeGreaterThan(0)
  })

  it('updates mounted rows on scroll', () => {
    render(
      <VirtualizedTreeList
        rows={rows(120)}
        height={120}
        rowHeight={30}
        overscan={1}
      />,
    )

    const viewport = screen.getByTestId('virtualized-tree-list')
    fireEvent.scroll(viewport, { target: { scrollTop: 1200 } })

    expect(screen.getByText('row-39')).toBeTruthy()
  })

  it('keeps a tab stop in the mounted rows after scrolling', () => {
    render(
      <VirtualizedTreeList
        rows={rows(120)}
        height={120}
        rowHeight={30}
        overscan={1}
      />,
    )

    const viewport = screen.getByTestId('virtualized-tree-list')
    fireEvent.scroll(viewport, { target: { scrollTop: 1200 } })

    const tabStops = screen
      .getAllByRole('treeitem')
      .filter((treeitem) => treeitem.tabIndex === 0)

    expect(tabStops).toHaveLength(1)
    expect(tabStops[0]?.getAttribute('aria-label')).toBe('Open row-39')
  })

  it('invokes row activation callback', () => {
    const onActivateRow = vi.fn()

    render(
      <VirtualizedTreeList
        rows={rows(10)}
        height={200}
        rowHeight={40}
        onActivateRow={onActivateRow}
      />,
    )

    fireEvent.click(screen.getByRole('treeitem', { name: 'Open row-0' }))
    expect(onActivateRow).toHaveBeenCalled()
  })

  it('moves focus to the next row on ArrowDown', () => {
    render(<VirtualizedTreeList rows={rows(5)} height={200} rowHeight={40} />)

    const first = screen.getByRole('treeitem', { name: 'Open row-0' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(
      screen.getByRole('treeitem', { name: 'Open row-1' }),
    )
  })

  it('moves focus to the previous row on ArrowUp', () => {
    render(<VirtualizedTreeList rows={rows(5)} height={200} rowHeight={40} />)

    const first = screen.getByRole('treeitem', { name: 'Open row-0' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    const second = screen.getByRole('treeitem', { name: 'Open row-1' })
    fireEvent.keyDown(second, { key: 'ArrowUp' })

    expect(document.activeElement).toBe(
      screen.getByRole('treeitem', { name: 'Open row-0' }),
    )
  })

  it('keeps Enter activation while navigating with arrows', () => {
    const onActivateRow = vi.fn()

    render(
      <VirtualizedTreeList
        rows={rows(5)}
        height={200}
        rowHeight={40}
        onActivateRow={onActivateRow}
      />,
    )

    const first = screen.getByRole('treeitem', { name: 'Open row-0' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    const second = screen.getByRole('treeitem', { name: 'Open row-1' })
    fireEvent.keyDown(second, { key: 'Enter' })

    expect(onActivateRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'row-1' }),
    )
  })

  it('clamps scroll position after rows shrink below the current viewport', () => {
    const { rerender } = render(
      <VirtualizedTreeList
        rows={rows(100)}
        height={120}
        rowHeight={30}
        overscan={1}
      />,
    )

    const viewport = screen.getByTestId('virtualized-tree-list')
    viewport.scrollTop = 2880
    fireEvent.scroll(viewport)

    rerender(
      <VirtualizedTreeList
        rows={rows(20)}
        height={120}
        rowHeight={30}
        overscan={1}
      />,
    )

    expect(viewport.scrollTop).toBe(480)
    expect(screen.getByText('row-19')).toBeTruthy()
  })
})
