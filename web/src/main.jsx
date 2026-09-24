import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@lowes-tech/bds-react';
import { GlobalStyles } from './theme/GlobalStyles.js';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <ThemeProvider theme="light" font="roboto">
    <GlobalStyles />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ThemeProvider>,
);
