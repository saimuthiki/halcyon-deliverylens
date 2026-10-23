import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { LoadingBlock } from './components/States';
import { probeApi } from './api/client';
import Overview from './pages/Overview';

const WhyLate = lazy(() => import('./pages/WhyLate'));
const Vendor = lazy(() => import('./pages/Vendor'));
const Simulator = lazy(() => import('./pages/Simulator'));
const Carriers = lazy(() => import('./pages/Carriers'));
const Clients = lazy(() => import('./pages/Clients'));
const StockRoutes = lazy(() => import('./pages/StockRoutes'));
const OrderIntake = lazy(() => import('./pages/OrderIntake'));
const Ask = lazy(() => import('./pages/Ask'));
const Activity = lazy(() => import('./pages/Activity'));

export default function App() {
  useEffect(() => {
    void probeApi();
  }, []);

  return (
    <Layout>
      <Suspense fallback={<LoadingBlock label="Loading page" />}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/why-late" element={<WhyLate />} />
          <Route path="/vendor" element={<Vendor />} />
          <Route path="/what-if" element={<Simulator />} />
          <Route path="/carriers" element={<Carriers />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/stock-routes" element={<StockRoutes />} />
          <Route path="/order-intake" element={<OrderIntake />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
