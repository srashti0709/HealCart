import AdminNotifications from "./pages/AdminNotifications";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import OrderHistory from "./pages/OrderHistory";
import Checkout from "./pages/Checkout";
import Storefront from "./pages/Storefront";
import Dashboard from "./pages/Dashboard";
import AdminProducts from "./pages/AdminProducts";
import StorefrontLayout from "./components/StorefrontLayout";
import CommandCenterLayout from "./components/CommandCenterLayout";
import StorefrontCartProvider from "./components/StorefrontCartProvider";
import AdminGate from "./components/AdminGate";

export default function App() {
  return (
    <StorefrontCartProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/user" replace />} />

          <Route
            path="/user"
            element={
              <StorefrontLayout>
                <Storefront />
              </StorefrontLayout>
            }
          />
          <Route path="/user/products/:id" element={<ProductDetails />} />
          <Route path="/user/cart" element={<Cart />} />
          <Route path="/user/checkout" element={<Checkout />} />
          <Route path="/user/orders" element={<OrderHistory />} />

          <Route
            path="/admin"
            element={
              <AdminGate>
                <AdminProducts />
              </AdminGate>
            }
          />

          <Route
            path="/admin/command-center"
            element={
              <AdminGate>
                <CommandCenterLayout>
                  <Dashboard />
                </CommandCenterLayout>
              </AdminGate>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <AdminGate>
                <AdminNotifications />
              </AdminGate>
            }
          />

          <Route path="*" element={<Navigate to="/user" replace />} />
        </Routes>
      </BrowserRouter>
    </StorefrontCartProvider>
  );
}
