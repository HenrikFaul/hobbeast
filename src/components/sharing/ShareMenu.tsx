import { useState } from 'react';
import { Check, Link2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  absoluteUrl,
  shareHref,
  shareMessage,
  supportsMessenger,
  type ShareSubject,
} from '@/features/sharing/shareTargets';

/**
 * Sharing a programme, without adding a row of buttons to the page.
 *
 * One icon, same as before. On a phone the first tap opens the operating
 * system's own share sheet — every app the person already has, nothing for us
 * to maintain — and the menu below is the fallback for desktops, where no such
 * sheet exists.
 *
 * Messenger appears only on devices where its deep link works; a button that
 * opens a dead page is worse than one that is not there.
 */

/** Simple marks rather than brand logos: no trademark, no colour clash. */
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.5-1.5h1.7V3.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V10H7.5v3h2.8v8h3.2z" />
    </svg>
  );
}

function MessengerMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.3 2 2 6.2 2 11.8c0 2.9 1.2 5.5 3.2 7.2v3.5l3-1.6c.9.2 1.8.4 2.8.4 5.7 0 10-4.2 10-9.8S17.7 2 12 2zm1 13-2.5-2.7L5.6 15l5.4-5.7 2.6 2.7L18.4 9 13 15z" />
    </svg>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1s-.5-.1-.7.1-.7 1-.9 1.2-.4.2-.7 0a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.4 0-.5.1-.7l.5-.6.3-.5v-.5l-1-2.2c-.2-.5-.4-.5-.6-.5h-.6a1.1 1.1 0 0 0-.8.4A3.3 3.3 0 0 0 5.5 9c0 1.4 1 2.8 1.2 3a11.5 11.5 0 0 0 4.4 3.9c1.6.6 2.2.7 3 .6a2.7 2.7 0 0 0 1.8-1.3c.2-.5.2-1 .2-1.1s-.3-.5-.6-.7zM12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
    </svg>
  );
}

interface ShareMenuProps {
  subject: Omit<ShareSubject, 'url'> & { url?: string; path?: string };
  /** Rendered as the trigger. Defaults to the icon button used until now. */
  label?: string;
  /** What a screen reader announces. Say what is being shared. */
  ariaLabel?: string;
  className?: string;
}

export function ShareMenu({ subject, label, ariaLabel, className }: ShareMenuProps) {
  const [copied, setCopied] = useState(false);

  const origin = typeof window === 'undefined' ? 'https://expericentre.com' : window.location.origin;
  const url = subject.url
    ? absoluteUrl(subject.url, origin)
    : subject.path
      ? absoluteUrl(subject.path, origin)
      : typeof window === 'undefined' ? origin : window.location.href;

  const full: ShareSubject = { ...subject, url };

  const messengerAvailable = typeof navigator !== 'undefined'
    && supportsMessenger(navigator.userAgent, navigator.maxTouchPoints > 0);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link másolva!');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('A másolás nem sikerült — jelöld ki a címsorban.');
    }
  };

  /**
   * The phone's own share sheet, when there is one. It reaches every app the
   * person actually uses, so it is offered first and the menu never opens.
   */
  const nativeShare = async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.share) return false;
    try {
      await navigator.share({ title: subject.title, text: shareMessage(full), url });
      return true;
    } catch (error) {
      // A person dismissing the sheet is not a failure worth reporting.
      if ((error as Error)?.name === 'AbortError') return true;
      return false;
    }
  };

  const open = (target: 'facebook' | 'messenger' | 'whatsapp') => {
    // noopener keeps the opened network away from this page's window object.
    window.open(shareHref(target, full), '_blank', 'noopener,noreferrer');
  };

  const trigger = label ? (
    <Button variant="outline" className={className}>
      <Share2 className="mr-2 h-4 w-4" aria-hidden="true" /> {label}
    </Button>
  ) : (
    <Button
      variant="outline"
      size="icon"
      aria-label={ariaLabel ?? `${subject.title} megosztása`}
      className={className ?? 'h-12 w-12 rounded-full bg-card'}
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={async (event) => {
        if (await nativeShare()) event.preventDefault();
      }}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => open('facebook')}>
          <FacebookMark /> <span className="ml-2">Facebook</span>
        </DropdownMenuItem>
        {messengerAvailable && (
          <DropdownMenuItem onSelect={() => open('messenger')}>
            <MessengerMark /> <span className="ml-2">Messenger</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => open('whatsapp')}>
          <WhatsAppMark /> <span className="ml-2">WhatsApp</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void copyLink(); }}>
          {copied
            ? <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            : <Link2 className="h-4 w-4" aria-hidden="true" />}
          <span className="ml-2">{copied ? 'Másolva' : 'Link másolása'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
