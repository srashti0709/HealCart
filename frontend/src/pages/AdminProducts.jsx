
import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_ENDPOINTS } from "../config/api";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  Bell,
  Activity,
  LogOut,
  Search,
  Boxes,
  AlertTriangle,
  Image as ImageIcon,
  ArrowUpRight,
  ShieldCheck,
  LayoutGrid,
} from "lucide-react";

const emptyProduct = {
  name: "",
  description: "",
  price: "",
  category: "",
  stock: "",
  image: "",
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const loadProducts = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axios.get(API_ENDPOINTS.products);
      setProducts(response.data.products || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const resetForm = () => {
    setForm(emptyProduct);
    setEditingId(null);
  };

  const startEdit = (product) => {
    setEditingId(product._id);
    setForm({
      name: product.name || "",
      description: product.description || "",
      price: String(product.price ?? ""),
      category: product.category || "",
      stock: String(product.stock ?? ""),
      image: product.image || "",
    });
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      category: form.category.trim(),
      stock: Number(form.stock),
      image: form.image.trim(),
    };

    if (
      !payload.name ||
      !payload.category ||
      form.price === "" ||
      form.stock === "" ||
      !Number.isFinite(payload.price) ||
      payload.price < 0 ||
      !Number.isInteger(payload.stock) ||
      payload.stock < 0
    ) {
      setError(
        "Enter a name, category, valid price, and non-negative whole-number stock."
      );
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await axios.put(`${API_ENDPOINTS.products}/${editingId}`, payload);
        setNotice("Product updated successfully.");
      } else {
        await axios.post(API_ENDPOINTS.products, payload);
        setNotice("Product added successfully.");
      }

      resetForm();
      await loadProducts();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save product.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await axios.delete(`${API_ENDPOINTS.products}/${product._id}`);
      setProducts((current) =>
        current.filter((item) => item._id !== product._id)
      );

      if (editingId === product._id) resetForm();

      setNotice("Product deleted successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete product.");
    }
  };

  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totalUnits = products.reduce(
    (sum, product) => sum + (Number(product.stock) || 0),
    0
  );

  const lowStockCount = products.filter(
    (product) => Number(product.stock) <= 5
  ).length;

  const inputClass =
    "w-full rounded-xl border border-[#e6e0f2] bg-white px-4 py-3 text-sm text-[#28213c] outline-none transition placeholder:text-[#a39bb5] hover:border-violet-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100/70";

  const labelClass =
    "block space-y-2 text-sm font-semibold text-[#443957]";

  const navClass =
    "inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition";

  return (
    <div className="min-h-screen bg-[#f8f7fc] text-[#28213c]">
      <header className="sticky top-0 z-30 border-b border-[#ece7f5] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
          <Link to="/admin" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white">
              <Package size={22} />
            </span>

            <span>
              <span className="block text-lg font-extrabold tracking-tight text-[#30234e]">
                HealCart
              </span>
              <span className="block text-xs text-[#817790]">
                Administration
              </span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1.5">
            <Link
              to="/admin"
              className={`${navClass} bg-violet-50 text-violet-800`}
            >
              <Package size={17} />
              Products
            </Link>

            <Link
              to="/admin/notifications"
              className={`${navClass} text-[#706681] hover:bg-violet-50 hover:text-violet-800`}
            >
              <Bell size={17} />
              <span className="hidden sm:inline">Notifications</span>
            </Link>

            <Link
              to="/admin/command-center"
              className={`${navClass} text-[#706681] hover:bg-violet-50 hover:text-violet-800`}
            >
              <Activity size={17} />
              <span className="hidden sm:inline">Command Center</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("healcartAdminToken");
                window.location.reload();
              }}
              className={`${navClass} ml-1 border border-[#ece7f5] text-[#706681] hover:border-red-200 hover:bg-red-50 hover:text-red-700`}
            >
              <LogOut size={17} />
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-7 px-5 py-7 lg:px-8 lg:py-9">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
              <LayoutGrid size={15} />
              Store management
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-[#28213c] sm:text-4xl">
              Product inventory
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#817790] sm:text-base">
              Manage your catalog, monitor stock levels, and keep product
              information up to date.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadProducts}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#e6e0f2] bg-white px-4 py-3 text-sm font-semibold text-[#514765] transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={17}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                document
                  .getElementById("product-form")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-200"
            >
              <Plus size={19} />
              Add product
            </button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#ece7f5] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#817790]">
                  Total products
                </p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-[#30234e]">
                  {products.length}
                </p>
                <p className="mt-1 text-xs text-[#9389a2]">
                  Products in your catalog
                </p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f0eaff] text-violet-700">
                <Package size={23} />
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#ece7f5] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#817790]">
                  Units in stock
                </p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-[#30234e]">
                  {totalUnits.toLocaleString("en-IN")}
                </p>
                <p className="mt-1 text-xs text-[#9389a2]">
                  Total inventory units
                </p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f0eaff] text-violet-700">
                <Boxes size={23} />
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200/80 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#817790]">
                  Low stock products
                </p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-amber-700">
                  {lowStockCount}
                </p>
                <p className="mt-1 text-xs text-[#9389a2]">
                  Five units or fewer
                </p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <AlertTriangle size={23} />
              </span>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertTriangle className="mt-0.5 shrink-0" size={19} />
            <p className="flex-1 leading-6">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="rounded-lg p-1 transition hover:bg-red-100"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <ShieldCheck size={19} className="mt-0.5 shrink-0" />
            <p className="flex-1 leading-6">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
              className="rounded-lg p-1 transition hover:bg-emerald-100"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <section
          id="product-form"
          className="scroll-mt-28 overflow-hidden rounded-2xl border border-[#ece7f5] bg-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee9f6] px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0eaff] text-violet-700">
                {editingId ? <Pencil size={20} /> : <Plus size={22} />}
              </span>

              <div>
                <h2 className="text-lg font-bold text-[#30234e]">
                  {editingId ? "Edit product" : "Add a product"}
                </h2>
                <p className="mt-1 text-sm text-[#817790]">
                  {editingId
                    ? "Update the selected product details."
                    : "Add a new item to your product catalog."}
                </p>
              </div>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-lg border border-[#e6e0f2] px-3 py-2 text-sm font-semibold text-[#655a79] transition hover:bg-violet-50"
              >
                <X size={16} />
                Cancel edit
              </button>
            )}
          </div>

          <form onSubmit={saveProduct} className="p-5 sm:p-7">
            <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
              <label className={labelClass}>
                Product name *
                <input
                  className={inputClass}
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  placeholder="Enter product name"
                  required
                  maxLength={120}
                />
              </label>

              <label className={labelClass}>
                Category *
                <input
                  className={inputClass}
                  name="category"
                  value={form.category}
                  onChange={updateField}
                  placeholder="For example, Audio"
                  required
                  maxLength={80}
                />
              </label>

              <label className={labelClass}>
                Price (₹) *
                <input
                  className={inputClass}
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={updateField}
                  placeholder="Enter price"
                  required
                />
              </label>

              <label className={labelClass}>
                Stock quantity *
                <input
                  className={inputClass}
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={updateField}
                  placeholder="Available units"
                  required
                />
              </label>

              <label className={`${labelClass} md:col-span-2`}>
                Image URL
                <input
                  className={inputClass}
                  name="image"
                  type="url"
                  value={form.image}
                  onChange={updateField}
                  placeholder="https://example.com/product-image.jpg"
                />
              </label>

              <label className={`${labelClass} md:col-span-2`}>
                Product description
                <textarea
                  className={`${inputClass} min-h-28 resize-y`}
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  placeholder="Describe the product and its key features..."
                  rows={4}
                  maxLength={2000}
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-4 border-t border-[#eee9f6] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#9389a2]">
                Fields marked with * are required.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-xl border border-[#e6e0f2] bg-white px-4 py-3 text-sm font-semibold text-[#655a79] transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset form
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <RefreshCw className="animate-spin" size={18} />
                  ) : editingId ? (
                    <Pencil size={17} />
                  ) : (
                    <Plus size={19} />
                  )}

                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Create product"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#ece7f5] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#eee9f6] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-[#30234e]">
                  Product catalog
                </h2>
                <span className="rounded-full bg-[#f1ebff] px-2.5 py-1 text-xs font-bold text-violet-800">
                  {filteredProducts.length} products
                </span>
              </div>
              <p className="mt-1.5 text-sm text-[#817790]">
                Manage product details, pricing, and inventory levels.
              </p>
            </div>

            <div className="relative w-full sm:max-w-sm">
              <Search
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9389a2]"
              />

              <input
                className={`${inputClass} pl-10 pr-10`}
                placeholder="Search products..."
                aria-label="Search products by name or category"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear product search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#817790] hover:bg-violet-100"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <RefreshCw
                size={28}
                className="animate-spin text-violet-600"
              />
              <p className="mt-4 text-sm font-semibold text-[#30234e]">
                Loading products...
              </p>
              <p className="mt-1 text-xs text-[#817790]">
                Retrieving your catalog.
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#f1ebff] text-violet-700">
                {search ? <Search size={28} /> : <ImageIcon size={30} />}
              </span>

              <h3 className="mt-4 text-lg font-bold text-[#30234e]">
                {search ? "No matching products" : "Your catalog is empty"}
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[#817790]">
                {search
                  ? "Try another product name or category."
                  : "Add a product using the form above to get started."}
              </p>

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-4 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left">
                <thead className="bg-[#faf9fd]">
                  <tr className="border-b border-[#eee9f6] text-xs font-bold uppercase tracking-wide text-[#817790]">
                    <th scope="col" className="px-6 py-4">
                      Product
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Category
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Price
                    </th>
                    <th scope="col" className="px-5 py-4">
                      Inventory
                    </th>
                    <th scope="col" className="px-6 py-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#f0ecf7]">
                  {filteredProducts.map((product) => {
                    const stock = Number(product.stock) || 0;
                    const isLowStock = stock <= 5;

                    return (
                      <tr
                        key={product._id}
                        className="transition-colors hover:bg-[#fbfaff]"
                      >
                        <td className="px-6 py-4">
                          <div className="flex min-w-0 items-center gap-3.5">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name || "Product"}
                                loading="lazy"
                                className="h-14 w-14 shrink-0 rounded-xl border border-[#eee9f6] bg-[#faf9fd] object-cover"
                              />
                            ) : (
                              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[#eee9f6] bg-[#f5f1ff] text-violet-700">
                                <Package size={23} />
                              </div>
                            )}

                            <div className="min-w-0">
                              <p className="max-w-sm break-words text-sm font-semibold leading-5 text-[#30234e]">
                                {product.name}
                              </p>

                              {product.description && (
                                <p className="mt-1 max-w-sm break-words text-xs leading-5 text-[#9389a2]">
                                  {product.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-lg bg-[#f5f1ff] px-2.5 py-1.5 text-xs font-semibold text-violet-800">
                            {product.category}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-[#30234e]">
                          ₹{Number(product.price).toLocaleString("en-IN")}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold ${
                                isLowStock
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isLowStock
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                              />
                              {isLowStock ? "Low stock" : "In stock"}
                            </span>

                            <span className="text-xs text-[#817790]">
                              {stock} {stock === 1 ? "unit" : "units"}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(product)}
                              aria-label={`Edit ${product.name}`}
                              title="Edit product"
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e6e0f2] px-2.5 text-xs font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
                            >
                              <Pencil size={15} />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteProduct(product)}
                              aria-label={`Delete ${product.name}`}
                              title="Delete product"
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-100 px-2.5 text-xs font-semibold text-red-700 transition hover:border-red-200 hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-100"
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredProducts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee9f6] bg-[#faf9fd] px-5 py-4 sm:px-7">
              <p className="text-xs text-[#817790]">
                Showing {filteredProducts.length} of {products.length} products
              </p>

              <button
                type="button"
                onClick={() => {
                  document
                    .getElementById("product-form")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-violet-800 transition hover:bg-violet-100"
              >
                Add another product
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eae5f3] pt-5 text-xs text-[#9389a2]">
          <span>HealCart Administration</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-violet-600" />
            Inventory management
          </span>
        </footer>
      </main>
    </div>
  );
}
