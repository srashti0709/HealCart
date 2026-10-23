import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import OrderHistory from "./pages/OrderHistory";
import Checkout from "./pages/Checkout";
import Storefront from "./pages/Storefront";
import Dashboard from "./pages/Dashboard";
import StorefrontLayout from "./components/StorefrontLayout";
import CommandCenterLayout from "./components/CommandCenterLayout";
import StorefrontCartProvider from "./components/StorefrontCartProvider";

export default function App() {
  return (
    <StorefrontCartProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <StorefrontLayout>
                <Storefront />
              </StorefrontLayout>
            }
          />
          <Route
            path="/dashboard"
            element={
              <CommandCenterLayout>
                <Dashboard />
              </CommandCenterLayout>
            }
          />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<OrderHistory />} />
          <Route path="/products/:id" element={<ProductDetails />} />
        </Routes>
      </BrowserRouter>
    </StorefrontCartProvider>
  );
}

