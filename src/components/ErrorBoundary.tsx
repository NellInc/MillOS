import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { LazyRecoveryContext } from '../utils/recoverableLazy';

export interface ErrorBoundaryFallbackProps {
  error: Error | null;
  resetErrorBoundary: () => void;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (props: ErrorBoundaryFallbackProps) => ReactNode;
  resetKeys?: readonly unknown[];
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recoveryGeneration: object;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, recoveryGeneration: {} };
  }

  static getDerivedStateFromError(error: Error): Pick<State, 'hasError' | 'error'> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(previousProps: Props) {
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      previousProps.resetKeys &&
      (this.props.resetKeys.length !== previousProps.resetKeys.length ||
        this.props.resetKeys.some(
          (value, index) => !Object.is(value, previousProps.resetKeys?.[index])
        ))
    ) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null, recoveryGeneration: {} });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          resetErrorBoundary: this.resetErrorBoundary,
        });
      }
      // An explicit `fallback={null}` means "render nothing": inside the R3F
      // Canvas the default DOM card is not a valid host element.
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
          <div
            role="alert"
            className="bg-slate-900 border border-red-500/50 rounded-xl p-8 max-w-md text-center"
          >
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-slate-400 mb-4">{this.state.error?.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg mx-auto"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reload
            </button>
          </div>
        </div>
      );
    }
    return (
      <LazyRecoveryContext.Provider value={this.state.recoveryGeneration}>
        {this.props.children}
      </LazyRecoveryContext.Provider>
    );
  }
}

interface RecoverableFeatureBoundaryProps {
  children: ReactNode;
  featureName: string;
  onDismiss?: () => void;
  resetKeys?: readonly unknown[];
}

export const RecoverableFeatureBoundary = ({
  children,
  featureName,
  onDismiss,
  resetKeys = [],
}: RecoverableFeatureBoundaryProps) => {
  return (
    <ErrorBoundary
      resetKeys={resetKeys}
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div
          role="alert"
          aria-label={`${featureName} unavailable`}
          className="m-3 rounded-lg border border-amber-500/50 bg-amber-950/70 p-4 text-amber-50"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{featureName} is temporarily unavailable</p>
              <p className="mt-1 break-words text-xs text-amber-100/80">
                {error?.message || 'The optional feature could not be loaded.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetErrorBoundary}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Retry feature
                </button>
                {onDismiss && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-400/50 px-3 py-2 text-sm font-semibold hover:bg-amber-500/10"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Close panel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    >
      <div className="contents">{children}</div>
    </ErrorBoundary>
  );
};

export default ErrorBoundary;
