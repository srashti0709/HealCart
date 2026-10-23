
import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_ENDPOINTS } from "../config/api";
import { Package, Plus, Pencil, Trash2, X, RefreshCw, Bell, Activity, LogOut } from "lucide-react";

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
      setError("Enter a name, category, valid price, and non-negative whole-number stock.");
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

  const inputClass =
    "w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400";

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090d16]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/admin" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
              <Package size={22} />
            </span>
            <span>
              <span className="block text-lg font-bold tracking-tight">SHCom Admin</span>
              <span className="block text-xs text-slate-400">Product management</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link to="/admin" className="rounded-lg bg-violet-500/15 px-3 py-2 text-violet-200">
              Products
            </Link>
            <Link to="/admin/notifications" className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/5">
              <Bell size={16} /> Notifications
            </Link>
            <Link to="/admin/command-center" className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/5">
              <Activity size={16} /> Command Center
            </Link>
            <button
              onClick={() => {
                localStorage.removeItem("shcomAdminToken");
                window.location.reload();
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <LogOut size={16} /> Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-violet-300">
              Store administration
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Products</h1>
            <p className="mt-2 text-sm text-slate-400">
              Manage your catalog and inventory. Customer checkout is kept separate.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadProducts}
              className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm hover:bg-white/5"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={() => {
                resetForm();
                document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-400"
            >
              <Plus size={17} /> Add product
            </button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-slate-400">Total products</p>
            <p className="mt-3 text-3xl font-bold">{products.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-slate-400">Units in stock</p>
            <p className="mt-3 text-3xl font-bold">
              {products.reduce((sum, product) => sum + (Number(product.stock) || 0), 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-slate-400">Low stock products</p>
            <p className="mt-3 text-3xl font-bold text-amber-300">
              {products.filter((product) => Number(product.stock) <= 5).length}
            </p>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {notice}
          </div>
        )}

        <section id="product-form" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{editingId ? "Edit product" : "Add a product"}</h2>
              <p className="mt-1 text-sm text-slate-400">Changes are saved to your product database.</p>
            </div>
            {editingId && (
              <button onClick={resetForm} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white">
                <X size={16} /> Cancel edit
              </button>
            )}
          </div>

          <form onSubmit={saveProduct} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-300">
              Product name *
              <input className={inputClass} name="name" value={form.name} onChange={updateField} required maxLength={120} />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              Category *
              <input className={inputClass} name="category" value={form.category} onChange={updateField} required maxLength={80} />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              Price *
              <input className={inputClass} name="price" type="number" min="0" step="0.01" value={form.price} onChange={updateField} required />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              Stock quantity *
              <input className={inputClass} name="stock" type="number" min="0" step="1" value={form.stock} onChange={updateField} required />
            </label>
            <label className="space-y-2 text-sm text-slate-300 sm:col-span-2">
              Image URL
              <input className={inputClass} name="image" type="url" value={form.image} onChange={updateField} placeholder="https://..." />
            </label>
            <label className="space-y-2 text-sm text-slate-300 sm:col-span-2 lg:col-span-3">
              Description
              <textarea className={inputClass} name="description" value={form.description} onChange={updateField} rows={3} maxLength={2000} />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                disabled={saving}
                className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Create product"}
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Catalog</h2>
              <p className="mt-1 text-sm text-slate-400">{filteredProducts.length} products shown</p>
            </div>
            <input
              className={`${inputClass} max-w-sm`}
              placeholder="Search name or category..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 p-10 text-center text-slate-400">Loading products...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">No products found.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-4">Product</th>
                      <th className="px-5 py-4">Category</th>
                      <th className="px-5 py-4">Price</th>
                      <th className="px-5 py-4">Stock</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredProducts.map((product) => (
                      <tr key={product._id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {product.image ? (
                              <img src={product.image} alt="" className="h-12 w-12 rounded-lg bg-white/5 object-cover" />
                            ) : (
                              <div className="grid h-12 w-12 place-items-center rounded-lg bg-white/5 text-slate-500"><Package size={20} /></div>
                            )}
                            <div>
                              <p className="font-medium text-white">{product.name}</p>
                              <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{product.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-300">{product.category}</td>
                        <td className="px-5 py-4 font-medium">₹{Number(product.price).toLocaleString("en-IN")}</td>
                        <td className="px-5 py-4">
                          <span className={Number(product.stock) <= 5 ? "rounded-full bg-amber-500/10 px-3 py-1 text-amber-300" : "text-slate-300"}>
                            {product.stock}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => startEdit(product)} aria-label={`Edit ${product.name}`} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-violet-400 hover:text-violet-300">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-red-400 hover:text-red-300">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
