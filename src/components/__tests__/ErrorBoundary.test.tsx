import { Suspense } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary, { RecoverableFeatureBoundary } from '../ErrorBoundary';
import { recoverableLazy } from '../../utils/recoverableLazy';

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Child component</div>;
};

describe('ErrorBoundary', () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (locationDescriptor) {
      Object.defineProperty(window, 'location', locationDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('renders children and does not report an error on the healthy path', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={false} />
        <div>Second child</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Child component')).toBeInTheDocument();
    expect(screen.getByText('Second child')).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it('renders the complete default fallback for the caught error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled();
    expect(screen.queryByText('Child component')).not.toBeInTheDocument();
  });

  it('uses a supplied fallback instead of the default fallback', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders nothing for an explicit null fallback instead of the default card', () => {
    const { container } = render(
      <ErrorBoundary fallback={null}>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('reports the exact error and component stack once', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, errorInfo] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test error message');
    expect(errorInfo.componentStack).toContain('ThrowError');
  });

  it('logs one structured ErrorBoundary diagnostic for the caught error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    const boundaryCalls = vi
      .mocked(console.error)
      .mock.calls.filter(([prefix]) => prefix === '[ErrorBoundary]');
    expect(boundaryCalls).toHaveLength(1);
    expect(boundaryCalls[0]).toEqual([
      '[ErrorBoundary]',
      expect.objectContaining({ message: 'Test error message' }),
      expect.objectContaining({ componentStack: expect.stringContaining('ThrowError') }),
    ]);
  });

  it('keeps nested failures inside the nearest boundary', () => {
    const outerOnError = vi.fn();
    const innerOnError = vi.fn();

    render(
      <ErrorBoundary onError={outerOnError}>
        <ErrorBoundary onError={innerOnError}>
          <ThrowError shouldThrow />
        </ErrorBoundary>
      </ErrorBoundary>
    );

    expect(innerOnError).toHaveBeenCalledTimes(1);
    expect(outerOnError).not.toHaveBeenCalled();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('reloads the page exactly once from the default recovery action', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('retains a failure until a reset key changes, then renders recovered children', () => {
    const { rerender } = render(
      <ErrorBoundary
        resetKeys={['same']}
        fallbackRender={({ error }) => <div>{error?.message}</div>}
      >
        <ThrowError shouldThrow />
      </ErrorBoundary>
    );

    rerender(
      <ErrorBoundary
        resetKeys={['same']}
        fallbackRender={({ error }) => <div>{error?.message}</div>}
      >
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Test error message')).toBeInTheDocument();
    expect(screen.queryByText('Child component')).not.toBeInTheDocument();

    rerender(
      <ErrorBoundary
        resetKeys={['changed']}
        fallbackRender={({ error }) => <div>{error?.message}</div>}
      >
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child component')).toBeInTheDocument();
    expect(screen.queryByText('Test error message')).not.toBeInTheDocument();
  });

  it('keeps an optional feature failure local and retries it in place', () => {
    let featureAvailable = false;
    const OptionalFeature = () => {
      if (!featureAvailable) throw new Error('Optional chunk unavailable');
      return <div>Recovered feature</div>;
    };

    render(
      <RecoverableFeatureBoundary featureName="SCADA">
        <OptionalFeature />
      </RecoverableFeatureBoundary>
    );

    expect(screen.getByRole('alert', { name: 'SCADA unavailable' })).toHaveTextContent(
      'Optional chunk unavailable'
    );
    featureAvailable = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry feature' }));

    expect(screen.getByText('Recovered feature')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'SCADA unavailable' })).not.toBeInTheDocument();
  });

  it('creates a fresh lazy payload after an exhausted chunk import is retried', async () => {
    let importAttempt = 0;
    const importer = vi.fn(async () => {
      importAttempt += 1;
      if (importAttempt <= 2) throw new Error('Chunk still unavailable');
      return { default: () => <div>Recovered lazy feature</div> };
    });
    const LazyFeature = recoverableLazy(importer, {
      attempts: 2,
      attemptTimeoutMs: 50,
      retryDelayMs: 0,
    });

    render(
      <RecoverableFeatureBoundary featureName="SCADA">
        <Suspense fallback={<div>Loading SCADA</div>}>
          <LazyFeature />
        </Suspense>
      </RecoverableFeatureBoundary>
    );

    expect(await screen.findByRole('alert', { name: 'SCADA unavailable' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry feature' }));

    expect(await screen.findByText('Recovered lazy feature')).toBeInTheDocument();
    expect(importer).toHaveBeenCalledTimes(3);
  });
});
