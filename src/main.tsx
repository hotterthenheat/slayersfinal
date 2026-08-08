import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/*
  Promote the web fonts from `media="print"` to `all`.

  index.html loads them as a print stylesheet so the request does not block
  first paint. Something has to flip them back, and the usual way — an `onload`
  attribute on the <link> — is an inline event handler, which is inline script:
  keeping it would have meant `script-src 'unsafe-inline'` in the CSP, giving up
  the directive that stops injected script in order to save a line.

  Doing it here is free. Nothing renders before this module runs, so the fonts
  cannot apply any later than the first content that would use them, and by then
  the stylesheet has been downloading since the parser hit the tag.
*/
const webfonts = document.getElementById('webfonts');
if (webfonts instanceof HTMLLinkElement) webfonts.media = 'all';

// NOTE: StrictMode is intentionally off — its dev-mode double-mounting breaks
// react-draggable/react-grid-layout drag initiation (RGL #1959). Dev-only
// diagnostic; production output is identical either way.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
