import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Storage polyfill — persistance locale via localStorage
if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const v = localStorage.getItem('detectia_' + key);
      if (v === null) throw new Error('Key not found');
      return { key, value: v };
    },
    set: async (key, value) => {
      localStorage.setItem('detectia_' + key, value);
      return { key, value };
    },
    delete: async (key) => {
      localStorage.removeItem('detectia_' + key);
      return { key, deleted: true };
    },
    list: async (prefix) => {
      const keys = Object.keys(localStorage)
        .filter(k => k.startsWith('detectia_' + (prefix || '')))
        .map(k => k.replace('detectia_', ''));
      return { keys };
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
