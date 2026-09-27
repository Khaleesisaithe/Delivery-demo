import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import TrackOrder from "@/pages/TrackOrder";
import Admin from "@/pages/Admin";
import StoreAccess from "@/pages/StoreAccess";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { STORE_ACCESS_PATH } from "@/const";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pedido" component={TrackOrder} />
      <Route path="/pedido/:publicId" component={TrackOrder} />
      <Route path={STORE_ACCESS_PATH} component={StoreAccess} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/financeiro" component={Admin} />
      <Route path="/admin/cardapio" component={Admin} />
      <Route path="/admin/loja" component={Admin} />
      <Route path="/admin/equipe" component={Admin} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <div id="service-ticket" />
          <div id="internal-ticket" />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
