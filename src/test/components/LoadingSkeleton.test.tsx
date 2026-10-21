import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingSkeleton } from '../../components/explorer/LoadingSkeleton'

describe('LoadingSkeleton', () => {
  it('exposes the busy explorer region and loading content', () => {
    render(<LoadingSkeleton />)

    const region = screen.getByRole('region', { name: /loading state/i })
    expect(region.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Loading explorer rows')).toBeTruthy()
  })
})
