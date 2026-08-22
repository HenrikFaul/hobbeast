import { Component, type ErrorInfo, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface CreateEventErrorBoundaryProps {
  children: ReactNode;
  onClose: () => void;
}

interface CreateEventErrorBoundaryState {
  hasError: boolean;
}

export class CreateEventErrorBoundary extends Component<CreateEventErrorBoundaryProps, CreateEventErrorBoundaryState> {
  state: CreateEventErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CreateEventErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[create_event] render_boundary', {
      errorCode: 'CREATE_EVENT_RENDER_FAILED',
      errorType: error.name,
      componentPresent: Boolean(info.componentStack),
    });
    toast.error('Az eseménylétrehozó ablak egyik része hibázott, de az ablak nyitva maradt.');
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" role="alertdialog" aria-modal="true" aria-labelledby="create-event-recovery-title">
        <div className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-modal">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="create-event-recovery-title" className="font-display text-lg font-bold">Az eseménylétrehozó stabilitási védelemre váltott</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A modal nem záródott be automatikusan. Próbáld újra, vagy zárd be kézzel.
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={this.props.onClose} aria-label="Eseménylétrehozó bezárása">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => this.setState({ hasError: false })}>Újrapróbálás</Button>
            <Button type="button" className="rounded-xl" onClick={this.props.onClose}>Bezárás</Button>
          </div>
        </div>
      </div>
    );
  }
}
