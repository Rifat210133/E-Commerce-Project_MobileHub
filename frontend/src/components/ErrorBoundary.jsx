import { Component } from "react";
import Icon from "./Icon";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface the real error in the browser console instead of leaving a blank page
    console.error("[ErrorBoundary] Caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
        <div className="max-w-xl w-full card p-8 space-y-4 border-accent-danger/40 border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent-danger/10 text-accent-danger flex items-center justify-center">
              <Icon name="error" size={28} />
            </div>
            <div>
              <h1 className="text-headline-sm text-ink">Something went wrong</h1>
              <p className="text-label-md text-ink-muted">
                The page failed to render. The error is shown below.
              </p>
            </div>
          </div>

          <pre className="text-label-sm bg-surface-alt border border-surface-border rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap break-words text-accent-danger">
            {String(error?.message || error)}
            {"\n\n"}
            {error?.stack ? error.stack.split("\n").slice(0, 8).join("\n") : ""}
          </pre>

          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={this.reset} className="btn-primary">
              <Icon name="refresh" size={18} /> Try again
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                } catch {}
                window.location.href = "/";
              }}
              className="btn-outline"
            >
              <Icon name="delete_sweep" size={18} /> Clear storage & reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
