import { Component, type ReactNode } from "react";
import { commonCopy } from "@/copy/common";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary]", error.message, error.stack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <h1 className="text-2xl font-semibold text-text-primary mb-4">{commonCopy.error.boundaryTitle}</h1>
          <p className="text-text-secondary mb-6">{commonCopy.error.boundaryMessage}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover transition-colors"
          >
            {commonCopy.error.boundaryReload}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
