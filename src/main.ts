import './index.css';
import { App as CapApp } from '@capacitor/app';
import { isCapacitorNative } from './config/RuntimeConfig';
import { Game } from './game/Game';
import { initNativeViewportChrome } from './utils/ResponsiveManager';

function bootstrap(): void {
  const webglMount = document.getElementById('webgl-mount');
  const uiRoot = document.getElementById('ui-root');

  if (!webglMount || !uiRoot) {
    throw new Error('Missing #webgl-mount or #ui-root container in index.html');
  }

  void initNativeViewportChrome();

  if (isCapacitorNative()) {
    void CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
      // Do not accidentally terminate the active game session on hardware Back press
    });
  }

  const game = new Game(webglMount, uiRoot);

  window.addEventListener('beforeunload', () => {
    game.dispose();
  });

  game.start().catch((err) => {
    console.error('[NEXUS] Failed to start game:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
