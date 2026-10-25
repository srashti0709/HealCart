
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
    "w-full rounded-xl border border-violet-200 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-violet-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

  const labelClass = "block space-y-2 text-base font-medium text-slate-700";

  return (
    <div className="min-h-screen bg-[#f7f6fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-200">
              <Package size={25} />
            </span>

            <span>
              <span className="block text-xl font-bold tracking-tight text-slate-900">
                HealCart Admin
              </span>
              <span className="mt-0.5 block text-base text-slate-600">
                Product management
              </span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-base font-medium">
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-800 transition hover:bg-violet-100"
            >
              <Package size={19} />
              Products
            </Link>

            <Link
              to="/admin/notifications"
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
            >
              <Bell size={19} />
              Notifications
            </Link>

            <Link
              to="/admin/command-center"
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
            >
              <Activity size={19} />
              Command Center
            </Link>

            <button
              onClick={() => {
                localStorage.removeItem("shcomAdminToken");
                window.location.reload();
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut size={19} />
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-8 px-5 py-8 lg:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-3xl border border-violet-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-violet-100/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-48 h-56 w-56 rounded-full bg-purple-100/70 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-base font-semibold text-violet-800">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                Store administration
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Products
              </h1>

              <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
                Manage your electronics catalog, update inventory, and keep
                product information organized.
              </p>
            </div>

            <div className="relative flex flex-wrap gap-3">
              <button
                type="button"
                onClick={loadProducts}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={19}
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200"
              >
                <Plus size={20} />
                Add product
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <div className="group rounded-2xl border border-violet-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-100/70">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-medium text-slate-600">
                  Total products
                </p>
                <p className="mt-4 text-4xl font-bold tracking-tight text-slate-950">
                  {products.length}
                </p>
                <p className="mt-2 text-base text-slate-600">
                  Products in your catalog
                </p>
              </div>

              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
                <Package size={27} />
              </span>
            </div>
          </div>

          <div className="group rounded-2xl border border-violet-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-100/70">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-medium text-slate-600">
                  Units in stock
                </p>
                <p className="mt-4 text-4xl font-bold tracking-tight text-slate-950">
                  {totalUnits.toLocaleString("en-IN")}
                </p>
                <p className="mt-2 text-base text-slate-600">
                  Total available inventory
                </p>
              </div>

              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-purple-100 text-purple-800 transition group-hover:bg-purple-700 group-hover:text-white">
                <Boxes size={27} />
              </span>
            </div>
          </div>

          <div className="group rounded-2xl border border-amber-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-100/70 sm:col-span-2 xl:col-span-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-medium text-slate-600">
                  Low stock products
                </p>
                <p className="mt-4 text-4xl font-bold tracking-tight text-amber-700">
                  {lowStockCount}
                </p>
                <p className="mt-2 text-base text-slate-600">
                  Products with 5 units or fewer
                </p>
              </div>

              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-800 transition group-hover:bg-amber-600 group-hover:text-white">
                <AlertTriangle size={27} />
              </span>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-base text-red-800"
          >
            <AlertTriangle className="mt-0.5 shrink-0" size={21} />
            <p className="flex-1 leading-6">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="rounded-lg p-1 text-red-700 transition hover:bg-red-100"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-base text-emerald-800"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100">
              <span className="text-lg font-bold">✓</span>
            </span>
            <p className="flex-1 leading-6">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
              className="rounded-lg p-1 text-emerald-800 transition hover:bg-emerald-100"
            >
              <X size={20} />
            </button>
          </div>
        )}

        <section
          id="product-form"
          className="scroll-mt-28 overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-purple-50 px-6 py-6 sm:px-8">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-700 text-white shadow-md shadow-violet-200">
                {editingId ? <Pencil size={23} /> : <Plus size={25} />}
              </span>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                  {editingId ? "Edit product" : "Add a product"}
                </h2>
                <p className="mt-1 text-base text-slate-600">
                  {editingId
                    ? "Update the selected product's information."
                    : "Enter the details for a new catalog product."}
                </p>
              </div>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-base font-semibold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50"
              >
                <X size={19} />
                Cancel edit
              </button>
            )}
          </div>

          <form onSubmit={saveProduct} className="p-6 sm:p-8">
            <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
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
                  placeholder="Enter available units"
                  required
                />
              </label>

              <label className={`${labelClass} sm:col-span-2`}>
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

              <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}>
                Product description
                <textarea
                  className={`${inputClass} min-h-32 resize-y`}
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  placeholder="Describe the product and its key features..."
                  rows={4}
                  maxLength={2000}
                />
              </label>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-violet-100 pt-6">
              <p className="text-base text-slate-600">
                Fields marked with * are required.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-base font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset form
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <RefreshCw className="animate-spin" size={20} />
                  ) : editingId ? (
                    <Pencil size={19} />
                  ) : (
                    <Plus size={21} />
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

        <section className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-5 border-b border-violet-100 px-6 py-6 sm:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                  Product catalog
                </h2>

                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-base font-semibold text-violet-800">
                  {filteredProducts.length} shown
                </span>
              </div>

              <p className="mt-2 text-base text-slate-600">
                Review inventory and manage your existing products.
              </p>
            </div>

            <div className="relative w-full sm:max-w-md">
              <Search
                size={21}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                className={`${inputClass} pl-12 pr-12`}
                placeholder="Search name or category..."
                aria-label="Search products by name or category"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear product search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-violet-100 hover:text-violet-800"
                >
                  <X size={19} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                <RefreshCw size={29} className="animate-spin" />
              </span>
              <p className="mt-5 text-lg font-semibold text-slate-800">
                Loading products
              </p>
              <p className="mt-2 text-base text-slate-600">
                Retrieving your catalog...
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <span className="grid h-20 w-20 place-items-center rounded-3xl bg-violet-100 text-violet-700">
                {search ? <Search size={33} /> : <ImageIcon size={35} />}
              </span>

              <h3 className="mt-5 text-xl font-bold text-slate-900">
                {search ? "No matching products" : "Your catalog is empty"}
              </h3>

              <p className="mt-2 max-w-md text-base leading-7 text-slate-600">
                {search
                  ? "Try another product name or category."
                  : "Add a product using the form above to get started."}
              </p>

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-5 rounded-xl bg-violet-700 px-5 py-3 text-base font-semibold text-white transition hover:bg-violet-800"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-violet-100 bg-[#faf9fe]">
                  <tr className="text-base font-semibold text-slate-700">
                    <th scope="col" className="px-6 py-5">
                      Product
                    </th>
                    <th scope="col" className="px-5 py-5">
                      Category
                    </th>
                    <th scope="col" className="px-5 py-5">
                      Price
                    </th>
                    <th scope="col" className="px-5 py-5">
                      Stock status
                    </th>
                    <th scope="col" className="px-6 py-5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-violet-100">
                  {filteredProducts.map((product) => {
                    const stock = Number(product.stock) || 0;
                    const isLowStock = stock <= 5;

                    return (
                      <tr
                        key={product._id}
                        className="transition-colors hover:bg-violet-50/60"
                      >
                        <td className="px-6 py-5">
                          <div className="flex min-w-0 items-center gap-4">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name || "Product"}
                                loading="lazy"
                                className="h-16 w-16 shrink-0 rounded-2xl border border-violet-100 bg-violet-50 object-cover"
                              />
                            ) : (
                              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700">
                                <Package size={27} />
                              </div>
                            )}

                            <div className="min-w-0">
                              <p className="max-w-sm break-words text-base font-semibold leading-6 text-slate-900">
                                {product.name}
                              </p>

                              {product.description && (
                                <p className="mt-1 max-w-sm break-words text-base leading-6 text-slate-600">
                                  {product.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-5">
                          <span className="inline-flex rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-base font-medium text-violet-800">
                            {product.category}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-5 py-5 text-base font-semibold text-slate-900">
                          ₹{Number(product.price).toLocaleString("en-IN")}
                        </td>

                        <td className="px-5 py-5">
                          <div className="flex flex-col items-start gap-2">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-base font-semibold ${
                                isLowStock
                                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                  isLowStock
                                    ? "bg-amber-600"
                                    : "bg-emerald-600"
                                }`}
                              />
                              {isLowStock ? "Low stock" : "In stock"}
                            </span>

                            <span className="text-base text-slate-600">
                              {stock} {stock === 1 ? "unit" : "units"}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(product)}
                              aria-label={`Edit ${product.name}`}
                              title="Edit product"
                              className="inline-flex h-11 items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-base font-semibold text-violet-800 transition hover:border-violet-500 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
                            >
                              <Pencil size={18} />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteProduct(product)}
                              aria-label={`Delete ${product.name}`}
                              title="Delete product"
                              className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-base font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-100"
                            >
                              <Trash2 size={18} />
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 bg-[#faf9fe] px-6 py-4 sm:px-8">
              <p className="text-base text-slate-600">
                Showing {filteredProducts.length} of {products.length} products
              </p>

              <button
                type="button"
                onClick={() => {
                  document
                    .getElementById("product-form")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-base font-semibold text-violet-800 transition hover:bg-violet-100"
              >
                Add another product
                <ArrowUpRight size={19} />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
