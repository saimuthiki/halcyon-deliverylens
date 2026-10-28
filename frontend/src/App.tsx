import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { LoadingBlock } from './components/States';
import { probeApi } from './api/client';
import HowItWorks from './pages/HowItWorks';

const Overview = lazy(() => import('./pages/Overview'));
const OrderDesk = lazy(() => import('./pages/OrderDesk'));

const WhyLate = lazy(() => import('./pages/WhyLate'));
const Vendor = lazy(() => import('./pages/Vendor'));
const Simulator = lazy(() => import('./pages/Simulator'));
const LateOrders = lazy(() => import('./pages/LateOrders'));
const Carriers = lazy(() => import('./pages/Carriers'));
const Clients = lazy(() => import('./pages/Clients'));
const StockRoutes = lazy(() => import('./pages/StockRoutes'));
const Ask = lazy(() => import('./pages/Ask'));
const Activity = lazy(() => import('./pages/Activity'));
const WeeklyBrief = lazy(() => import('./pages/WeeklyBrief'));
const RiskBoard = lazy(() => import('./pages/RiskBoard'));
const ConfirmAddress = lazy(() => import('./pages/ConfirmAddress'));

export default function App() {
  useEffect(() => {
    void probeApi();
  }, []);

  return (
    <Routes>
      {/* The page a client opens from our email: no app navigation around it. */}
      <Route
        path="/confirm-address/:token"
        element={
          <Suspense fallback={<LoadingBlock label="Loading" />}>
            <ConfirmAddress />
          </Suspense>
        }
      />
      <Route path="*" element={<AppPages />} />
    </Routes>
  );
}

function AppPages() {
  return (
    <Layout>
      <Suspense fallback={<LoadingBlock label="Loading page" />}>
        <Routes>
          <Route path="/" element={<Navigate to="/how-it-works" replace />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/order-desk" element={<OrderDesk />} />
          <Route path="/why-late" element={<WhyLate />} />
          <Route path="/vendor" element={<Vendor />} />
          <Route path="/what-if" element={<Simulator />} />
          <Route path="/late-orders" element={<LateOrders />} />
          <Route path="/pick-wave" element={<Navigate to="/late-orders" replace />} />
          <Route path="/carriers" element={<Carriers />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/stock-routes" element={<StockRoutes />} />
          <Route path="/order-intake" element={<Navigate to="/order-desk" replace />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/weekly-brief" element={<WeeklyBrief />} />
          <Route path="/risk-board" element={<RiskBoard />} />
          <Route path="*" element={<Navigate to="/how-it-works" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
