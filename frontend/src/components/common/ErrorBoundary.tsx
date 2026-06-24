import { Component, type ReactNode } from 'react'
import { ErrorState } from './ErrorState'

interface ErrorBoundaryProps {
  children: ReactNode
  message?: string
  /** Optional custom fallback; receives the reset callback. */
  fallback?: (reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('ErrorBoundary caught:', error)
  }

  reset = () => this.setState({ hasError: false })

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.reset)
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <ErrorState
          message={this.props.message ?? 'Something went wrong rendering this section.'}
          onRetry={this.reset}
        />
      </div>
    )
  }
}
