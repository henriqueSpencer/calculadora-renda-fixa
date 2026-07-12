import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* tira o loader assim que o React monta */
const boot = document.getElementById('boot');
if (boot) {
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 300);
}
