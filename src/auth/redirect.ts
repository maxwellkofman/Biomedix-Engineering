// Popup sign-in lands here; hand the response back to the app window.
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

broadcastResponseToMainFrame().catch(() => {
  const msg = document.getElementById('msg');
  if (msg) msg.textContent = 'Sign-in could not finish. Close this window and try again.';
});
