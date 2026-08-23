import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
// generative-loaders ships its keyframes as a stylesheet rather than inline
// styles, which is what lets it work under the app's `style-src 'self'` CSP —
// imported here so it is bundled with ours rather than fetched.
import 'generative-loaders/styles.css';

// NOTE: StrictMode is intentionally off — its dev-mode double-mounting breaks
// react-draggable/react-grid-layout drag initiation (RGL #1959). Dev-only
// diagnostic; production output is identical either way.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
