import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/ui/Toast';
import { initializePwa, registerPwaServiceWorker } from './lib/pwa';
import { configureQueryCache, QUERY_GC_TIMES } from './lib/queryCachePolicy';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: QUERY_GC_TIMES.default,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

configureQueryCache(queryClient);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

initializePwa();
registerPwaServiceWorker();
