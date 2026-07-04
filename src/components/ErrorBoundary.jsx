import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // hook point for Sentry/analytics later
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="card p-8 max-w-md text-center animate-scale-in">
            <div className="text-5xl mb-3">💥</div>
            <h1 className="text-xl font-bold text-neutral-900 mb-2">Something went wrong</h1>
            <p className="text-neutral-500 text-sm mb-5">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.assign('/') }}
              className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-5 py-2.5 rounded-full text-sm"
            >
              Reload app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
