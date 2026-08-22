import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildTelemetryEvent, createCorrelationId } from '@/lib/observability';
import { buildReleaseLabel } from '@/lib/buildInfo';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
  correlationId: string | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false, correlationId: null };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true, correlationId: createCorrelationId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const correlationId = this.state.correlationId || createCorrelationId();
    // Structured and intentionally local until an approved telemetry sink is
    // configured. No user/session payload is attached.
    console.error('[app-error-boundary]', buildTelemetryEvent('error', 'client_render_error', {
      correlationId,
      release: buildReleaseLabel(),
    }, {
      error_type: error.name,
      component_stack_present: Boolean(info.componentStack),
    }));
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <section role="alert" aria-labelledby="app-error-title" className="w-full max-w-lg rounded-2xl border bg-card p-6 text-center shadow-lg sm:p-8">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" aria-hidden="true" />
          <h1 id="app-error-title" className="font-display text-2xl font-bold">Valami félbeszakította az oldalt</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Az adataidat nem módosítottuk automatikusan. Frissítsd az oldalt, vagy térj vissza a kezdőlapra.
          </p>
          {this.state.correlationId && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">Hibahivatkozás: {this.state.correlationId}</p>
          )}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button type="button" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Újrapróbálom
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.assign('/')}>
              <Home className="mr-2 h-4 w-4" aria-hidden="true" /> Kezdőlap
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
