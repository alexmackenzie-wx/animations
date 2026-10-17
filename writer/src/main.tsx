import { createRoot } from 'react-dom/client';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/600-italic.css';
import '@fontsource/newsreader/700.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import App from './App';

// Excalidraw loads its hand-drawn fonts from here (bundled, so drawing works offline).
window.EXCALIDRAW_ASSET_PATH = new URL('./excalidraw/', window.location.href).href;

createRoot(document.getElementById('root')!).render(<App />);
