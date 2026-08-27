import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ScrollToTop } from '@/components/ScrollToTop';

/**
 * Opening a link from halfway down a long list used to drop the reader at the
 * bottom of the page they had just opened: the browser restores the previous
 * offset, and in a single-page app that offset lands on whatever renders next.
 */

function Navigate({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to); }, [navigate, to]);
  return null;
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.history.scrollRestoration = 'auto';
});

describe('ScrollToTop', () => {
  it('takes the browser off automatic scroll restoration', () => {
    render(<MemoryRouter><ScrollToTop /></MemoryRouter>);
    expect(window.history.scrollRestoration).toBe('manual');
  });

  it('scrolls to the top when a new page is opened', () => {
    render(
      <MemoryRouter initialEntries={['/events']}>
        <ScrollToTop />
        <Routes>
          <Route path="/events" element={<Navigate to="/klubok" />} />
          <Route path="/klubok" element={<p>klubok</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  /** A #fragment names a place on the page, and that place wins. */
  it('honours a fragment instead of jumping to the top', () => {
    const target = document.createElement('div');
    target.id = 'reszletek';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    render(
      <MemoryRouter initialEntries={['/a']}>
        <ScrollToTop />
        <Routes>
          <Route path="/a" element={<Navigate to="/b#reszletek" />} />
          <Route path="/b" element={<p>b</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(target.scrollIntoView).toHaveBeenCalled();
    document.body.removeChild(target);
  });

  /**
   * The entry render — and going back — arrive as POP, where the browser's
   * own remembered position is the right answer: the reader is returning to a
   * page they were already reading and expects to find their place.
   */
  it('leaves a POP navigation alone', () => {
    render(
      <MemoryRouter initialEntries={['/events']}>
        <ScrollToTop />
        <Routes><Route path="/events" element={<p>events</p>} /></Routes>
      </MemoryRouter>,
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
