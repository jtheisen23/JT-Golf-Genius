import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('App render crash:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-black text-white p-6 flex flex-col gap-4">
          <h1 className="text-xl font-bold text-red-500">Something went wrong</h1>
          <p className="text-sm text-neutral-300">
            The screen failed to render. The data is still safe — try one of the options below.
          </p>
          <pre className="bg-neutral-900 text-xs text-red-300 p-3 rounded overflow-auto max-h-60 whitespace-pre-wrap">
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => {
                localStorage.removeItem('vegas-golf-active-round');
                localStorage.removeItem('vegas-golf-game-code');
                window.location.hash = '#/';
                window.location.reload();
              }}
              className="bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold"
            >
              Reset & go home
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="bg-neutral-800 text-neutral-200 px-4 py-2 rounded text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
