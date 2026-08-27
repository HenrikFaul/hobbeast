import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * A new page starts at the top.
 *
 * The browser restores the previous scroll offset after a history navigation,
 * and in a single-page app that offset is applied to whatever renders next —
 * so opening a link from halfway down a long list dropped the reader at the
 * bottom of the page they had just opened, with no way to know why.
 *
 * Going BACK is the one case where the restored position is right: the reader
 * is returning to a page they were already reading, and they expect to find
 * their place. So automatic restoration is turned off and done deliberately:
 * top on a new navigation, remembered position on back and forward.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return;
    window.history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    // POP is back/forward: leave the browser's remembered position alone.
    if (navigationType === 'POP') return;

    // A #fragment names a place on the page, and that place wins.
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }

    window.scrollTo(0, 0);
    // Deliberately NOT watching `search`: the events page writes the filters
    // into the query string as you type, and scrolling to the top on every
    // keystroke would be worse than the bug this fixes.
  }, [pathname, hash, navigationType]);

  return null;
}
