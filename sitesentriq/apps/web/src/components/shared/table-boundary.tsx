import { Component, type ReactNode } from 'react'

/**
 * TableBoundary — contains the HeroUI v3 (beta) Table collection-build race.
 *
 * React-Aria's table collection can throw synchronously during the FIRST commit
 * when a table mounts with data already present (e.g. landing on a list right
 * after a mutation, with React Query cache warm). The errors look like:
 *   - "Cell count must match column count. Found N cells and 0 columns."
 *   - "<X> cannot be rendered outside a collection."
 * The markup is correct; it's a reconciliation-ordering race in the library.
 *
 * This boundary catches ONLY those collection errors and remounts the table —
 * a clean second mount rebuilds the collection correctly. Real errors (anything
 * not matching the signature) are re-thrown so the page-level boundary handles
 * them. After a few failed retries it shows a small inline fallback with a
 * manual retry, rather than taking down the whole page.
 */

const COLLECTION_ERROR_RE =
  /must match column count|rendered outside a collection|\d+ cells? and \d+ columns?/i

const MAX_AUTO_RETRIES = 3

interface Props {
  children: ReactNode
  /** Optional custom fallback shown once auto-retries are exhausted. */
  fallback?: ReactNode
}

interface State {
  phase: 'ok' | 'retrying' | 'failed'
  remountKey: number
}

export class TableBoundary extends Component<Props, State> {
  state: State = { phase: 'ok', remountKey: 0 }
  private retries = 0

  static getDerivedStateFromError(): Partial<State> {
    // Stop rendering the crashed subtree for this commit; decide what to do in
    // componentDidCatch (which has the error to match against).
    return { phase: 'retrying' }
  }

  componentDidCatch(error: Error) {
    if (!COLLECTION_ERROR_RE.test(error?.message ?? '')) {
      // Not the known collection race — let the nearest parent boundary handle it.
      throw error
    }
    if (this.retries < MAX_AUTO_RETRIES) {
      this.retries += 1
      this.setState((s) => ({ phase: 'ok', remountKey: s.remountKey + 1 }))
    } else {
      this.setState({ phase: 'failed' })
    }
  }

  private manualRetry = () => {
    this.retries = 0
    this.setState((s) => ({ phase: 'ok', remountKey: s.remountKey + 1 }))
  }

  render() {
    if (this.state.phase === 'failed') {
      return (
        this.props.fallback ?? (
          <div className="p-6 text-center text-label text-text-muted">
            Couldn&apos;t display this table.{' '}
            <button onClick={this.manualRetry} className="text-brand-500 hover:underline">
              Retry
            </button>
          </div>
        )
      )
    }
    if (this.state.phase === 'retrying') {
      // One blank commit while we remount; children re-render on the next tick.
      return <div key={`retry-${this.state.remountKey}`} />
    }
    // `display: contents` keeps the wrapper layout-neutral so it doesn't disturb
    // the table; the key forces a clean remount when we retry.
    return (
      <div key={this.state.remountKey} style={{ display: 'contents' }}>
        {this.props.children}
      </div>
    )
  }
}
