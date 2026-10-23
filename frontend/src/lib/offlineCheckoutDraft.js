const DB_NAME = "shcom-offline-recovery";
const STORE_NAME = "checkoutDrafts";
const DRAFT_KEY = "active-checkout";

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCheckoutDraft(customer, cart) {
  const safeCustomer = Object.fromEntries(
    ["name", "email", "address", "city", "postalCode"].map((key) => [key, String(customer?.[key] || "")])
  );
  const safeCart = Array.isArray(cart) ? cart.map(({ productId, quantity }) => ({ productId, quantity })) : [];
  const draft = { customer: safeCustomer, cart: safeCart, savedAt: new Date().toISOString() };
  const db = await openDraftDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(draft, DRAFT_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  try { localStorage.setItem("shcomCheckoutDraftMeta", JSON.stringify({ savedAt: draft.savedAt, fields: Object.values(safeCustomer).filter(Boolean).length, items: safeCart.length })); } catch {}
  return draft;
}

export async function readCheckoutDraft() {
  const db = await openDraftDb();
  const draft = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(DRAFT_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return draft;
}

export async function deleteCheckoutDraft() {
  const db = await openDraftDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(DRAFT_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  localStorage.removeItem("shcomCheckoutDraftMeta");
}
