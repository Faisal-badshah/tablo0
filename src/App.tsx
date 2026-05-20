import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { RestaurantProvider } from "@/context/RestaurantContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import SubscriptionGate from "@/components/SubscriptionGate";
import LandingPage from "./pages/LandingPage";
import Signup from "./pages/Signup";
import CustomerMenu from "./pages/CustomerMenu";
import StaffLogin from "./pages/StaffLogin";
import KitchenDashboard from "./pages/KitchenDashboard";
import BillingDashboard from "./pages/BillingDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/** Resolves the slug — looks up the restaurant, or follows an alias and redirects. */
const SlugResolver = () => {
  const { slug, tableNumber } = useParams();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ok' } | { kind: 'redirect'; to: string } | { kind: 'notfound' }>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!slug) return setState({ kind: 'notfound' });
      const { data } = await supabase.from('restaurants').select('id').eq('slug', slug).maybeSingle();
      if (cancelled) return;
      if (data) return setState({ kind: 'ok' });
      // Try alias
      const { data: alias } = await (supabase as any).from('restaurant_slug_aliases').select('restaurant_id').eq('slug', slug).maybeSingle();
      if (cancelled) return;
      if (alias?.restaurant_id) {
        const { data: r } = await supabase.from('restaurants').select('slug').eq('id', alias.restaurant_id).maybeSingle();
        if (cancelled) return;
        if (r?.slug) {
          const to = tableNumber ? `/r/${r.slug}/t/${tableNumber}` : `/r/${r.slug}`;
          return setState({ kind: 'redirect', to });
        }
      }
      setState({ kind: 'ok' }); // fall through; RestaurantProvider will show NotFound
    };
    run();
    return () => { cancelled = true; };
  }, [slug, tableNumber]);

  if (state.kind === 'loading') {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (state.kind === 'redirect') return <Navigate to={state.to} replace />;
  return (
    <RestaurantProvider slug={slug} tableNumber={tableNumber}>
      <CustomerMenu />
    </RestaurantProvider>
  );
};

const LegacyCustomerMenuWrapper = () => {
  const { restaurantId, tableNumber } = useParams();
  return (
    <RestaurantProvider restaurantId={restaurantId} tableNumber={tableNumber}>
      <CustomerMenu />
    </RestaurantProvider>
  );
};

const StaffDashboardWrapper = ({
  children, allowedRoles,
}: { children: React.ReactNode; allowedRoles: ('owner' | 'kitchen' | 'billing' | 'super_admin')[]; }) => (
  <ProtectedRoute allowedRoles={allowedRoles}>
    <SubscriptionGate>
      <StaffRestaurantProvider>{children}</StaffRestaurantProvider>
    </SubscriptionGate>
  </ProtectedRoute>
);

const StaffRestaurantProvider = ({ children }: { children: React.ReactNode }) => {
  const { restaurantId } = useAuth();
  return <RestaurantProvider restaurantId={restaurantId}>{children}</RestaurantProvider>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/staff/login" element={<StaffLogin />} />
            <Route path="/r/:slug" element={<SlugResolver />} />
            <Route path="/r/:slug/t/:tableNumber" element={<SlugResolver />} />
            <Route path="/order/:restaurantId/:tableNumber" element={<LegacyCustomerMenuWrapper />} />
            <Route path="/kitchen" element={<StaffDashboardWrapper allowedRoles={['kitchen', 'owner']}><KitchenDashboard /></StaffDashboardWrapper>} />
            <Route path="/billing" element={<StaffDashboardWrapper allowedRoles={['billing', 'owner']}><BillingDashboard /></StaffDashboardWrapper>} />
            <Route path="/owner" element={<StaffDashboardWrapper allowedRoles={['owner']}><OwnerDashboard /></StaffDashboardWrapper>} />
            <Route path="/super-admin" element={<ProtectedRoute allowedRoles={['super_admin']}><SuperAdminDashboard /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
