import React, { ReactNode, ErrorInfo } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary component for catching React errors
 * Prevents entire app from crashing, shows graceful fallback
 * 
 * Usage:
 * <ErrorBoundary fallback={<ErrorFallback />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Error caught by boundary:', {
      error: error.toString(),
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h1>
              <p className="text-gray-600 mb-4">We're sorry for the inconvenience. Please try refreshing the page.</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Refresh Page
              </button>
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-4 text-left bg-red-50 p-4 rounded">
                  <summary className="cursor-pointer font-semibold text-red-900">Error Details</summary>
                  <pre className="mt-2 text-xs text-red-700 overflow-auto max-h-40">
                    {this.state.error?.toString()}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

/**
 * Skeleton loader for claim results
 * Shows loading state while fact-check is in progress
 */
export const SkeletonLoader: React.FC<{ count?: number }> = ({ count = 1 }) => {
  return (
    <div className="space-y-4">
      {Array(count)
        .fill(0)
        .map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 shadow animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        ))}
    </div>
  );
};

/**
 * Accessible loading spinner with ARIA attributes
 */
export const LoadingSpinner: React.FC<{ text?: string }> = ({ text = 'Loading...' }) => {
  return (
    <div
      className="flex flex-col items-center justify-center p-8"
      role="status"
      aria-label={text}
      aria-live="polite"
    >
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      {text && <p className="mt-4 text-gray-600 text-sm">{text}</p>}
    </div>
  );
};

/**
 * Fallback component for when claims are not found
 */
export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}> = ({ title, description, action }) => {
  return (
    <div className="text-center py-12">
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-600 mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          aria-label={action.label}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

/**
 * Toast notification component for user feedback
 */
export const Toast: React.FC<{
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose?: () => void;
}> = ({ message, type = 'info', onClose }) => {
  React.useEffect(() => {
    if (onClose) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [onClose]);

  const typeStyles = {
    success: 'bg-green-50 border-green-200 text-green-900',
    error: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900'
  };

  return (
    <div
      className={`border rounded-lg p-4 ${typeStyles[type]}`}
      role="alert"
      aria-live="polite"
    >
      <p className="text-sm">{message}</p>
    </div>
  );
};

