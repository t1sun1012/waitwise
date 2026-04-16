import '../../assets/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReviewHub } from '../../components/ReviewHub';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Popup root element was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ReviewHub />
  </React.StrictMode>
);
