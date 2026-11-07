// Global styles must load before page styles so page-level modifiers win.
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AccountProvider } from './account/AccountContext';
import { IntakeProvider } from './intake/IntakeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccountProvider>
        <IntakeProvider>
          <App />
        </IntakeProvider>
      </AccountProvider>
    </BrowserRouter>
  </StrictMode>,
);
