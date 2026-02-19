import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { supabase } from "../supabaseClient";

const ORDER_STATUSES = ["To Ship", "Out for Delivery", "Completed", "Cancelled"];
const PRODUCT_IMG_BUCKET = "product-images";
const DEFAULT_CATEGORIES = ["Notebooks", "Pens", "Pencils", "Paper", "Accessories", "Paintings"];
const CATEGORY_ALIASES = {
  accesories: "accessories",
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

function money(n) {
  return `₱${Number(n || 0).toFixed(2)}`;
}
function safeLower(x) {
  return String(x || "").toLowerCase();
}
function normalizeCategoryKey(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return "";
  return CATEGORY_ALIASES[raw] || raw;
}
function buildCategoryList(values) {
  const defaultMap = new Map(
    DEFAULT_CATEGORIES.map((c) => [normalizeCategoryKey(c), c])
  );
  const byKey = new Map();

  for (const val of values) {
    const key = normalizeCategoryKey(val);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, defaultMap.get(key) || String(val).trim());
  }

  return Array.from(byKey.values()).sort();
}
function toStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
function getOrderUserId(o) {
  return (
    o?.user_id ??
    o?.customer_id ??
    o?.profile_id ??
    o?.user_uuid ??
    o?.user ??
    o?.profile ??
    null
  );
}
function orderCustomerName(o) {
  const v =
    o?.customer_name ??
    o?.customer_full_name ??
    o?.customer_fullname ??
    o?.full_name ??
    o?.name ??
    o?.buyer_name ??
    o?.customer ??
    "";
  return typeof v === "string" ? v : "";
}
function orderCustomerPhone(o) {
  const v =
    o?.customer_phone ??
    o?.phone ??
    o?.contact ??
    o?.contact_no ??
    o?.contact_number ??
    "";
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}
function orderAddress(o) {
  const v = o?.address ?? o?.shipping_address ?? o?.delivery_address ?? "";
  return typeof v === "string" ? v : "";
}

function extractBarangay(address) {
  const raw = String(address || "").trim();
  if (!raw) return "Unknown";

  const parts = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const matched = parts.find((part) => /barangay|brgy\.?/i.test(part));
  const source = matched || parts[1] || parts[0] || "Unknown";

  return source
    .replace(/^barangay\s*/i, "")
    .replace(/^brgy\.?\s*/i, "")
    .trim() || "Unknown";
}

function normalizeOrderStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "cancelled" || s === "canceled") return "Cancelled";
  if (s === "completed") return "Completed";
  if (s === "ship" || s === "shipped" || s === "delivering" || s === "out for delivery") {
    return "Out for Delivery";
  }
  return "To Ship";
}

function paymentStatusLabel(order) {
  const method = String(order?.payment_method || "").toLowerCase();
  const status = String(order?.status || "").toLowerCase();
  if (method.includes("gcash")) return "Paid";
  if (method.includes("cod") && status === "completed") return "Paid";
  if (method.includes("cod")) return "Pending";
  return "Unpaid";
}

function normalizeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getProductNamesFor(o) {
  const items = normalizeItems(o?.items);
  if (items.length === 0) return "No items";
  const names = items.map(item => item.name || "Item").slice(0, 2);
  const displayStr = names.join(", ");
  return items.length > 2 ? `${displayStr} +${items.length - 2} more` : displayStr;
}

export default function Admin() {
  const nav = useNavigate();

  const [tab, setTab] = useState("dashboard"); // dashboard | products | orders | payments | users | sales
  const [msg, setMsg] = useState({ type: "", text: "" });

  // auth + role
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState(null);

  // products
  const [products, setProducts] = useState([]);
  const [pLoading, setPLoading] = useState(false);
  const [pSearch, setPSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    stock: "0",
    image_url: "",
    length_options: [],
    color_options: [],
  });

  const LENGTH_PRESETS = ["Long", "Short"];
  const COLOR_PRESETS = ["Assorted", "Black", "Blue", "Red", "Green"];
  const [customLength, setCustomLength] = useState("");
  const [customColor, setCustomColor] = useState("");

  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [uploadingProductImage, setUploadingProductImage] = useState(false);

  // edit mode
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingOriginalImageUrl, setEditingOriginalImageUrl] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);

  useEffect(() => {
    if (!productImageFile) {
      setProductImagePreview("");
      return;
    }
    const obj = URL.createObjectURL(productImageFile);
    setProductImagePreview(obj);
    return () => URL.revokeObjectURL(obj);
  }, [productImageFile]);

  // orders
  const [orders, setOrders] = useState([]);
  const [oLoading, setOLoading] = useState(false);
  const [oSearch, setOSearch] = useState("");
  const [oCategory, setOCategory] = useState("All");
  const [viewOrder, setViewOrder] = useState(null);
  const [deliveryDraftByOrderId, setDeliveryDraftByOrderId] = useState({});
  const [completingOrderId, setCompletingOrderId] = useState(null);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [deliveryHistoryHydrated, setDeliveryHistoryHydrated] = useState(false);
  const [showDeliveryHistory, setShowDeliveryHistory] = useState(false);
  const [salesProductCategory, setSalesProductCategory] = useState("All");
  const [salesDateRange, setSalesDateRange] = useState("All");
  const [salesDateFrom, setSalesDateFrom] = useState("");
  const [salesDateTo, setSalesDateTo] = useState("");
  const [salesFilterMenuOpen, setSalesFilterMenuOpen] = useState(false);
  const [showBestBuysOnly, setShowBestBuysOnly] = useState(false);

  // users / profiles
  const [users, setUsers] = useState([]);
  const [uLoading, setULoading] = useState(false);
  const [uSearch, setUSearch] = useState("");
  const [profileNameById, setProfileNameById] = useState({});
  const [profilesById, setProfilesById] = useState({});
  const [userMenuOpen, setUserMenuOpen] = useState(null);
  const [productMenuOpen, setProductMenuOpen] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setMsg({ type: "", text: "" });

        const { data: sess } = await supabase.auth.getSession();
        const session = sess?.session;
        if (!session) {
          nav("/login");
          return;
        }

        setMe(session.user);

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (pErr) {
          console.error("profile read error", pErr);
          setMsg(pErr.message);
          setIsAdmin(false);
          return;
        }

        const admin = safeLower(prof?.role) === "admin";
        setIsAdmin(admin);

        if (!admin) {
          setMsg({ type: "error", text: "You are not authorized to view this page." });
          return;
        }

        refreshAll();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin_delivery_history");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setDeliveryHistory(parsed);
      }
    } catch {
      // ignore storage parse errors
    } finally {
      setDeliveryHistoryHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!deliveryHistoryHydrated) return;
    try {
      localStorage.setItem("admin_delivery_history", JSON.stringify(deliveryHistory));
    } catch {
      // ignore storage write errors
    }
  }, [deliveryHistory, deliveryHistoryHydrated]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen && !productMenuOpen && !salesFilterMenuOpen) return;
    
    function handleClick(e) {
      // Close menu if clicking outside
      if (!e.target.closest('button') && !e.target.closest('.user-menu-dropdown')) {
        setUserMenuOpen(null);
        setProductMenuOpen(null);
        setSalesFilterMenuOpen(false);
      }
    }
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [userMenuOpen, productMenuOpen, salesFilterMenuOpen]);

  async function refreshAll() {
    await Promise.all([refreshProducts(), refreshUsers(), refreshOrders()]);
  }

  async function refreshProducts() {
    try {
      setPLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, category, stock, image_url, length_options, color_options")
        .order("id", { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    } finally {
      setPLoading(false);
    }
  }

  async function refreshUsers() {
    try {
      setULoading(true);
      setMsg("");
      
      const timeoutMs = 5000;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), timeoutMs)
      );

      const query = supabase
        .from("profiles")
        .select("id, role, full_name, email, banned, created_at")
        .order("created_at", { ascending: false });

      const { data, error } = await Promise.race([query, timeout]);

      if (error) throw error;

      const list = (data || []).map((u) => ({
        ...u,
        name: pickFirstString(u.full_name) || "—",
      }));

      const mapName = {};
      const mapFull = {};
      for (const u of list) {
        mapName[u.id] = u.name;
        mapFull[u.id] = u;
      }
      setUsers(list);
      setProfileNameById(mapName);
      setProfilesById(mapFull);
    } catch (e) {
      console.error("refreshUsers error:", e);
      setMsg({ type: "error", text: e.message || "Failed to load users" });
    } finally {
      setULoading(false);
    }
  }

  async function refreshOrders() {
    try {
      setOLoading(true);
      setMsg("");

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      const list = data || [];
      setOrders(list);

      const ids = Array.from(
        new Set(
          list
            .map((o) => getOrderUserId(o))
            .filter((v) => typeof v === "string" && v.length > 0)
        )
      );

      if (ids.length > 0) {
        const { data: profs, error: perr } = await supabase
          .from("profiles")
          .select("id, full_name, contact_number, barangay, address")
          .in("id", ids);

        if (!perr && Array.isArray(profs)) {
          setProfileNameById((prev) => {
            const next = { ...prev };
            for (const p of profs) {
              next[p.id] = pickFirstString(p.full_name) || prev[p.id] || "—";
            }
            return next;
          });
          setProfilesById((prev) => {
            const next = { ...prev };
            for (const p of profs) {
              next[p.id] = { ...prev[p.id], ...p };
            }
            return next;
          });
        }
      }
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    } finally {
      setOLoading(false);
    }
  }

  async function uploadProductImage(file) {
    if (!file) return "";

    setUploadingProductImage(true);
    try {
      const safeName = (file.name || "image.jpg").replace(/\s+/g, "_");
      const path = `products/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(PRODUCT_IMG_BUCKET)
        .upload(path, file, { upsert: false });

      if (upErr) throw new Error(upErr.message);

      const { data } = supabase.storage.from(PRODUCT_IMG_BUCKET).getPublicUrl(path);
      const url = data?.publicUrl || "";
      if (!url) throw new Error("Failed to get public URL for uploaded image.");
      return url;
    } finally {
      setUploadingProductImage(false);
    }
  }

  function normalizeOptionArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    return String(value)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function toggleOption(field, option) {
    setForm((prev) => {
      const list = normalizeOptionArray(prev[field]);
      const exists = list.includes(option);
      const next = exists ? list.filter((v) => v !== option) : [...list, option];
      return { ...prev, [field]: next };
    });
  }

  function addCustomOption(field, value) {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    setForm((prev) => {
      const list = normalizeOptionArray(prev[field]);
      if (list.includes(cleaned)) return prev;
      return { ...prev, [field]: [...list, cleaned] };
    });
  }

  function startEditProduct(p) {
    setMsg("");
    setShowProductForm(true);
    setEditingProductId(p.id);
    setEditingOriginalImageUrl(p.image_url || "");

    setForm({
      name: p.name || "",
      description: p.description || "",
      price: String(p.price ?? ""),
      category: p.category || "",
      stock: String(p.stock ?? "0"),
      image_url: p.image_url || "",
      length_options: normalizeOptionArray(p.length_options),
      color_options: normalizeOptionArray(p.color_options),
    });

    setCustomLength("");
    setCustomColor("");

    setProductImageFile(null);
    setProductImagePreview("");
  }

  function cancelEdit() {
    setEditingProductId(null);
    setEditingOriginalImageUrl("");
    setShowProductForm(false);
    setMsg("");

    setForm({
      name: "",
      description: "",
      price: "",
      category: "",
      stock: "0",
      image_url: "",
      length_options: [],
      color_options: [],
    });

    setCustomLength("");
    setCustomColor("");

    setProductImageFile(null);
    setProductImagePreview("");
  }

  async function addProduct(e) {
    e.preventDefault();
    setMsg("");

    try {
      let finalImageUrl = form.image_url.trim() || null;

      if (editingProductId && !finalImageUrl && !productImageFile) {
        finalImageUrl = editingOriginalImageUrl || null;
      }

      if (productImageFile) {
        finalImageUrl = await uploadProductImage(productImageFile);
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        price: Number(form.price),
        stock: Number(form.stock),
        image_url: finalImageUrl,
        length_options: normalizeOptionArray(form.length_options),
        color_options: normalizeOptionArray(form.color_options),
      };

      const { error } = editingProductId
        ? await supabase.from("products").update(payload).eq("id", editingProductId)
        : await supabase.from("products").insert(payload);

      if (error) return setMsg({ type: "error", text: error.message });

      setForm({
        name: "",
        description: "",
        price: "",
        category: "",
        stock: "0",
        image_url: "",
        length_options: [],
        color_options: [],
      });

      setCustomLength("");
      setCustomColor("");

      setProductImageFile(null);
      setProductImagePreview("");

      setEditingProductId(null);
      setEditingOriginalImageUrl("");
      setShowProductForm(false);

      refreshProducts();
    } catch (err) {
      setMsg({ type: "error", text: err?.message || "Failed to save product." });
    }
  }

  async function removeProduct(id) {
    setProductMenuOpen(null);
    
    // Find product name for confirmation
    const product = products.find(p => p.id === id);
    const productName = product?.name || "this product";
    
    if (!confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) return;
    
    setMsg("");
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;

      if (editingProductId === id) cancelEdit();
      refreshProducts();
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    }
  }

  function normalizeQty(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }

  function getItemProductId(item) {
    const raw =
      item?.product_id ??
      item?.productId ??
      item?.id ??
      item?.product?.id ??
      0;
    const productId = Number(raw);
    return Number.isFinite(productId) && productId > 0 ? productId : 0;
  }

  function getItemQty(item) {
    return normalizeQty(item?.qty ?? item?.quantity ?? item?.count ?? 0);
  }

  function addItemToQtyMap(map, item) {
    const productId = getItemProductId(item);
    const qty = getItemQty(item);
    if (productId <= 0 || qty <= 0) return;
    map[productId] = (map[productId] || 0) + qty;
  }

  async function collectOrderProductQty(order) {
    const qtyByProductId = {};

    const orderItems = normalizeItems(order?.items);
    for (const item of orderItems) addItemToQtyMap(qtyByProductId, item);

    if (Object.keys(qtyByProductId).length > 0) return qtyByProductId;

    const orderId = Number(order?.id || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return qtyByProductId;

    const { data: orderItemsRows, error: orderItemsErr } = await supabase
      .from("order_items")
      .select("product_id, qty, quantity")
      .eq("order_id", orderId);

    if (orderItemsErr) {
      throw orderItemsErr;
    }

    for (const item of orderItemsRows || []) addItemToQtyMap(qtyByProductId, item);

    return qtyByProductId;
  }

  async function restoreStocksForOrder(order) {
    const qtyByProductId = await collectOrderProductQty(order);

    const productIds = Object.keys(qtyByProductId).map(Number).filter((id) => id > 0);
    if (!productIds.length) return;

    const { data: rows, error: readErr } = await supabase
      .from("products")
      .select("id, stock")
      .in("id", productIds);

    if (readErr) throw readErr;

    const updates = (rows || []).map((product) => {
      const restoreQty = Number(qtyByProductId[Number(product.id)] || 0);
      if (restoreQty <= 0) return Promise.resolve({ error: null });

      return supabase
        .from("products")
        .update({ stock: Number(product.stock || 0) + restoreQty })
        .eq("id", product.id);
    });

    const results = await Promise.all(updates);
    const failed = results.find((r) => r?.error);
    if (failed?.error) throw failed.error;
  }

  async function deductStocksForOrder(order) {
    const qtyByProductId = await collectOrderProductQty(order);

    const productIds = Object.keys(qtyByProductId).map(Number).filter((id) => id > 0);
    if (!productIds.length) return;

    const { data: rows, error: readErr } = await supabase
      .from("products")
      .select("id, stock")
      .in("id", productIds);

    if (readErr) throw readErr;

    for (const product of rows || []) {
      const deductQty = Number(qtyByProductId[Number(product.id)] || 0);
      if (deductQty <= 0) continue;
      const currentStock = Number(product.stock || 0);
      if (currentStock < deductQty) {
        throw new Error(`Not enough stock to complete this order. Product ID: ${product.id}`);
      }
    }

    const updates = (rows || []).map((product) => {
      const deductQty = Number(qtyByProductId[Number(product.id)] || 0);
      if (deductQty <= 0) return Promise.resolve({ error: null });

      return supabase
        .from("products")
        .update({ stock: Number(product.stock || 0) - deductQty })
        .eq("id", product.id);
    });

    const results = await Promise.all(updates);
    const failed = results.find((r) => r?.error);
    if (failed?.error) throw failed.error;
  }

  async function updateOrderStatus(order, status, paymentMethod) {
    setMsg({ type: "", text: "" });
    try {
      const orderId = order?.id;
      if (!orderId) return;

      const currentStatus = normalizeOrderStatus(order?.status);
      const nextStatus = normalizeOrderStatus(status);

      const shouldRestoreStocks = currentStatus !== "Cancelled" && nextStatus === "Cancelled";
      if (shouldRestoreStocks) {
        await restoreStocksForOrder(order);
      }

      const shouldDeductStocks = currentStatus === "Cancelled" && nextStatus !== "Cancelled";
      if (shouldDeductStocks) {
        await deductStocksForOrder(order);
      }

      const payload = { status };
      const method = String(paymentMethod || "").toLowerCase();

      if (status === "Completed" && (method.includes("cod") || method.includes("gcash"))) {
        payload.payment_status = "Paid";
      }

      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) throw error;

      await Promise.all([refreshOrders(), refreshProducts()]);
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: e.message });
    }
  }

  async function toggleAdmin(userId, makeAdmin) {
    setMsg({ type: "", text: "" });
    setUserMenuOpen(null);
    try {
      const nextRole = makeAdmin ? "admin" : "user";

      const { error } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", userId);

      if (error) throw error;

      console.log(`User ${userId} role updated to ${nextRole}`);

      // Refresh the users list to show updated role
      await refreshUsers();

      setMsg({ type: "success", text: `User role changed to ${nextRole}` });
    } catch (e) {
      console.error("toggleAdmin error:", e);
      setMsg({ type: "error", text: e.message || "Failed to update user role" });
    }
  }

  async function banUser(userId) {
    setMsg({ type: "", text: "" });
    setUserMenuOpen(null);
    if (!confirm("Are you sure you want to ban this user? They will not be able to log in.")) {
      return;
    }
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ banned: true })
        .eq("id", userId);

      if (error) throw error;

      await refreshUsers();
      setMsg({ type: "success", text: "User banned successfully" });
    } catch (e) {
      console.error("banUser error:", e);
      setMsg({ type: "error", text: e.message || "Failed to ban user" });
    }
  }

  async function unbanUser(userId) {
    setMsg({ type: "", text: "" });
    setUserMenuOpen(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ banned: false })
        .eq("id", userId);

      if (error) throw error;

      await refreshUsers();
      setMsg({ type: "success", text: "User unbanned successfully" });
    } catch (e) {
      console.error("unbanUser error:", e);
      setMsg({ type: "error", text: e.message || "Failed to unban user" });
    }
  }

  function resolvedOrderName(o) {
    const orderUserId = getOrderUserId(o);
    const fromProfile = typeof orderUserId === "string" ? profileNameById[orderUserId] : "";
    const fromOrder = orderCustomerName(o);
    return pickFirstString(toStr(fromProfile), toStr(fromOrder)) || "—";
  }

  function resolvedOrderPhone(o) {
    const orderUserId = getOrderUserId(o);
    const prof = typeof orderUserId === "string" ? profilesById[orderUserId] : null;
    const fromProfile = prof?.contact_number;
    const fromOrder = orderCustomerPhone(o);
    return pickFirstString(toStr(fromProfile), toStr(fromOrder)) || "—";
  }

  function resolvedOrderAddress(o) {
    const orderUserId = getOrderUserId(o);
    const prof = typeof orderUserId === "string" ? profilesById[orderUserId] : null;
    const fromProfile = prof?.address;
    const fromOrder = orderAddress(o);
    return pickFirstString(toStr(fromProfile), toStr(fromOrder)) || "—";
  }

  const filteredProducts = useMemo(() => {
    const q = safeLower(pSearch).trim();
    return products.filter((p) => {
      const textOk =
        safeLower(p.name).includes(q) ||
        safeLower(p.description).includes(q) ||
        safeLower(p.category).includes(q);
      const stockOk = !lowStockOnly || Number(p.stock || 0) <= 5;
      return (q ? textOk : true) && stockOk;
    });
  }, [products, pSearch, lowStockOnly]);

  const lowStockCount = useMemo(
    () => products.filter((p) => Number(p.stock || 0) <= 5).length,
    [products]
  );

  const categories = useMemo(() => {
    const dbCats = products.map((p) => p.category).filter(Boolean);
    return buildCategoryList([...DEFAULT_CATEGORIES, ...dbCats]).filter(
      (c) => normalizeCategoryKey(c) !== "writing"
    );
  }, [products]);

  const filteredOrders = useMemo(() => {
    const q = safeLower(oSearch).trim();

    return orders.filter((o) => {
      const status = normalizeOrderStatus(o?.status);
      const categoryOk = oCategory === "All"
        ? status !== "Completed"
        : status === oCategory;
      if (!categoryOk) return false;

      if (!q) return true;

      const name = safeLower(resolvedOrderName(o));
      const phone = safeLower(resolvedOrderPhone(o));
      const addr = safeLower(resolvedOrderAddress(o));
      return (
        safeLower(status).includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        addr.includes(q) ||
        String(o?.id).includes(q)
      );
    });
  }, [orders, oSearch, oCategory, profileNameById, profilesById]);

  const filteredUsers = useMemo(() => {
    const q = safeLower(uSearch).trim();
    if (!q) return users;
    return users.filter((u) => {
      return (
        safeLower(u.name).includes(q) ||
        safeLower(u.full_name).includes(q) ||
        safeLower(u.role).includes(q) ||
        safeLower(u.email).includes(q) ||
        String(u.id).includes(q)
      );
    });
  }, [users, uSearch]);

  const toShipCount = useMemo(
    () => orders.filter((o) => normalizeOrderStatus(o?.status) === "To Ship").length,
    [orders]
  );

  const paymentOrders = useMemo(
    () => orders.filter((o) => normalizeOrderStatus(o?.status) === "Out for Delivery"),
    [orders]
  );

  function getDeliveryDraft(orderId) {
    return deliveryDraftByOrderId[orderId] || {
      driver: "",
      report: "",
      safelyDelivered: false,
    };
  }

  function setDeliveryDraft(orderId, patch) {
    setDeliveryDraftByOrderId((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {
          driver: "",
          report: "",
          safelyDelivered: false,
        }),
        ...patch,
      },
    }));
  }

  async function completePaymentOrder(order) {
    const orderId = order?.id;
    if (!orderId) return;

    const draft = getDeliveryDraft(orderId);
    if (!draft.driver.trim()) {
      setMsg({ type: "error", text: "Driver name is required before completing the order." });
      return;
    }
    if (!draft.report.trim()) {
      setMsg({ type: "error", text: "Delivery report is required before completing the order." });
      return;
    }
    if (!draft.safelyDelivered) {
      setMsg({ type: "error", text: "Please confirm the order was safely delivered." });
      return;
    }

    setCompletingOrderId(orderId);
    try {
      await updateOrderStatus(order, "Completed", order.payment_method);
      
      // Add to delivery history
      const historyEntry = {
        orderId: orderId,
        driver: draft.driver,
        report: draft.report,
        safelyDelivered: draft.safelyDelivered,
        customerName: resolvedOrderName(order),
        customerPhone: resolvedOrderPhone(order),
        customerAddress: resolvedOrderAddress(order),
        productNames: getProductNamesFor(order),
        paymentMethod: order.payment_method,
        total: order.total,
        shippingFee: order.shipping_fee || 0,
        completedAt: new Date().toISOString(),
      };
      
      setDeliveryHistory((prev) => [historyEntry, ...prev]);
      
      setDeliveryDraftByOrderId((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setMsg({ type: "success", text: `Order #${orderId} marked as completed.` });
    } finally {
      setCompletingOrderId(null);
    }
  }

  const productById = useMemo(() => {
    const map = {};
    for (const product of products) {
      map[Number(product.id)] = product;
    }
    return map;
  }, [products]);

  const salesOrders = useMemo(
    () => orders.filter((o) => normalizeOrderStatus(o?.status) === "Completed"),
    [orders]
  );

  const isWithinSalesDateRange = (order) => {
    if (!order?.created_at) return false;
    const orderDate = new Date(order.created_at);
    if (Number.isNaN(orderDate.getTime())) return false;

    if (salesDateFrom) {
      const fromDate = new Date(`${salesDateFrom}T00:00:00`);
      if (orderDate < fromDate) return false;
    }

    if (salesDateTo) {
      const toDate = new Date(`${salesDateTo}T23:59:59.999`);
      if (orderDate > toDate) return false;
    }

    return true;
  };

  const filteredSalesOrders = useMemo(() => {
    return salesOrders.filter((order) => isWithinSalesDateRange(order));
  }, [salesOrders, salesDateFrom, salesDateTo]);

  const salesIncome = useMemo(
    () => filteredSalesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    [filteredSalesOrders]
  );

  const totalShippingFee = useMemo(
    () => filteredSalesOrders.reduce((sum, order) => sum + Number(order.shipping_fee || 0), 0),
    [filteredSalesOrders]
  );

  const salesByDay = useMemo(() => {
    const dayMap = {};
    for (const order of filteredSalesOrders) {
      const key = order?.created_at
        ? new Date(order.created_at).toLocaleDateString()
        : "Unknown Date";
      dayMap[key] = (dayMap[key] || 0) + Number(order.total || 0);
    }
    return Object.entries(dayMap)
      .map(([day, amount]) => ({ day, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [filteredSalesOrders]);

  const salesByCategory = useMemo(() => {
    const categoryMap = {};
    for (const order of filteredSalesOrders) {
      const items = normalizeItems(order.items);
      for (const item of items) {
        const productId = Number(item?.product_id || 0);
        const category =
          item?.category || productById[productId]?.category || "Uncategorized";
        const qty = Number(item?.qty || 0);
        const price = Number(item?.price || 0);
        categoryMap[category] = (categoryMap[category] || 0) + qty * price;
      }
    }
    return Object.entries(categoryMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredSalesOrders, productById]);

  const salesByBarangay = useMemo(() => {
    const barangayMap = {};
    for (const order of filteredSalesOrders) {
      const orderUserId = getOrderUserId(order);
      const profile = typeof orderUserId === "string" ? profilesById[orderUserId] : null;
      
      // Use barangay field from profile directly
      const barangay = profile?.barangay?.trim() || "Unknown";
      barangayMap[barangay] = (barangayMap[barangay] || 0) + 1;
    }

    return Object.entries(barangayMap)
      .map(([barangay, count]) => ({ barangay, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredSalesOrders, profilesById]);

  const soldProducts = useMemo(() => {
    const productMap = {};
    for (const order of filteredSalesOrders) {
      const items = normalizeItems(order.items);
      for (const item of items) {
        const productId = Number(item?.product_id || 0);
        const key = productId > 0 ? `id:${productId}` : `name:${item?.name || "Unknown"}`;
        if (!productMap[key]) {
          productMap[key] = {
            name: item?.name || productById[productId]?.name || "Unknown",
            category: item?.category || productById[productId]?.category || "Uncategorized",
            qty: 0,
            amount: 0,
          };
        }
        const qty = Number(item?.qty || 0);
        const price = Number(item?.price || 0);
        productMap[key].qty += qty;
        productMap[key].amount += qty * price;
      }
    }
    return Object.values(productMap).sort((a, b) => b.qty - a.qty);
  }, [filteredSalesOrders, productById]);

  const soldProductCategories = useMemo(() => {
    const categories = Array.from(new Set(soldProducts.map((item) => item.category).filter(Boolean))).sort();
    return ["All", ...categories];
  }, [soldProducts]);

  const filteredSoldProducts = useMemo(() => {
    let products = salesProductCategory === "All" 
      ? soldProducts 
      : soldProducts.filter((item) => item.category === salesProductCategory);
    
    // Show only top 10 best-selling products if Best Buys is active
    if (showBestBuysOnly) {
      products = products.slice(0, 10);
    }
    
    return products;
  }, [soldProducts, salesProductCategory, showBestBuysOnly]);

  const monthTrend = useMemo(() => {
    const now = new Date();
    const monthData = Array(12).fill(0);
    const monthMap = {};

    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthMap[key] = 0;
    }

    for (const order of salesOrders) {
      if (!order?.created_at) continue;
      const date = new Date(order.created_at);
      if (Number.isNaN(date.getTime())) continue;

      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (Object.prototype.hasOwnProperty.call(monthMap, key)) {
        monthMap[key] += Number(order.total || 0);
      }
    }

    let idx = 0;
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthData[idx] = monthMap[key] || 0;
      idx += 1;
    }

    return monthData;
  }, [salesOrders]);

  const dayTrend = useMemo(() => {
    const now = new Date();
    const dayData = Array(12).fill(0);
    const dayMap = {};

    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(now.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      dayMap[key] = 0;
    }

    for (const order of salesOrders) {
      if (!order?.created_at) continue;
      const date = new Date(order.created_at);
      if (Number.isNaN(date.getTime())) continue;

      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const key = day.toISOString().slice(0, 10);
      if (Object.prototype.hasOwnProperty.call(dayMap, key)) {
        dayMap[key] += Number(order.total || 0);
      }
    }

    let idx = 0;
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(now.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      dayData[idx] = dayMap[key] || 0;
      idx += 1;
    }

    return dayData;
  }, [salesOrders]);

  const trendDateLabels = useMemo(() => {
    const now = new Date();
    const labels = [];
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(now.getDate() - i);
      labels.push(date.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    }
    return labels;
  }, []);

  const totalRevenueAll = useMemo(
    () => salesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    [salesOrders]
  );

  const newCustomersCount = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return users.filter((u) => {
      if (!u?.created_at) return false;
      const createdAt = new Date(u.created_at);
      if (Number.isNaN(createdAt.getTime())) return false;
      return createdAt.getMonth() === month && createdAt.getFullYear() === year;
    }).length;
  }, [users]);

  const usersVisitSeries = useMemo(() => {
    const mapByDay = {};
    const days = [];
    const now = new Date();

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      mapByDay[key] = new Set();
      days.push({
        key,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }

    for (const order of orders) {
      if (!order?.created_at) continue;
      const date = new Date(order.created_at);
      if (Number.isNaN(date.getTime())) continue;
      const key = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        .toISOString()
        .slice(0, 10);
      if (!mapByDay[key]) continue;
      const uid = getOrderUserId(order);
      if (uid) mapByDay[key].add(uid);
    }

    return days.map((d) => ({
      ...d,
      value: mapByDay[d.key]?.size || 0,
    }));
  }, [orders]);

  const dashboardSalesTrendData = useMemo(
    () => ({
      labels: trendDateLabels,
      datasets: [
        {
          label: "Last 12 Months",
          data: monthTrend,
          borderColor: "rgb(5, 150, 105)",
          backgroundColor: "rgba(5, 150, 105, 0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: "Last 12 Days",
          data: dayTrend,
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    }),
    [monthTrend, dayTrend, trendDateLabels]
  );

  const dashboardSalesTrendOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "top" },
        tooltip: {
          callbacks: {
            title: (ctx) => ctx[0]?.label || "",
            label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          beginAtZero: true,
          ticks: {
            display: false,
            callback: (value) => money(value),
          },
        },
      },
    }),
    []
  );

  const dashboardUsersVisitData = useMemo(
    () => ({
      labels: usersVisitSeries.map((point) => point.label),
      datasets: [
        {
          label: "Unique Visitors",
          data: usersVisitSeries.map((point) => point.value),
          backgroundColor: "rgba(16, 185, 129, 0.85)",
          borderRadius: 6,
        },
      ],
    }),
    [usersVisitSeries]
  );

  const dashboardUsersVisitOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { display: false, precision: 0 },
        },
      },
    }),
    []
  );

  const salesByDayChartData = useMemo(
    () => ({
      labels: salesByDay.map((entry) => entry.day),
      datasets: [
        {
          label: "Income",
          data: salesByDay.map((entry) => entry.amount),
          backgroundColor: "rgba(5, 150, 105, 0.85)",
          borderRadius: 6,
        },
      ],
    }),
    [salesByDay]
  );

  const salesByCategoryChartData = useMemo(
    () => ({
      labels: salesByCategory.map((entry) => entry.category),
      datasets: [
        {
          label: "Income",
          data: salesByCategory.map((entry) => entry.amount),
          backgroundColor: "rgba(37, 99, 235, 0.85)",
          borderRadius: 6,
        },
      ],
    }),
    [salesByCategory]
  );

  const salesByBarangayChartData = useMemo(
    () => ({
      labels: salesByBarangay.map((entry) => entry.barangay),
      datasets: [
        {
          label: "Buyers",
          data: salesByBarangay.map((entry) => entry.count),
          backgroundColor: "rgba(124, 58, 237, 0.85)",
          borderRadius: 6,
        },
      ],
    }),
    [salesByBarangay]
  );

  const salesCurrencyBarOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Income: ${money(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: {
            display: false,
            callback: (value) => money(value),
          },
        },
      },
    }),
    []
  );

  const salesCountBarOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { display: false, precision: 0 },
        },
      },
    }),
    []
  );

  useEffect(() => {
    const now = new Date();
    const toYMD = (d) => d.toISOString().slice(0, 10);

    if (salesDateRange === "All") {
      setSalesDateFrom("");
      setSalesDateTo("");
      return;
    }

    if (salesDateRange === "Today") {
      const today = toYMD(now);
      setSalesDateFrom(today);
      setSalesDateTo(today);
      return;
    }

    if (salesDateRange === "Last 7 Days") {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      setSalesDateFrom(toYMD(from));
      setSalesDateTo(toYMD(now));
      return;
    }

    if (salesDateRange === "This Month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setSalesDateFrom(toYMD(firstDay));
      setSalesDateTo(toYMD(now));
    }
  }, [salesDateRange]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-700">
        Loading…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border rounded-2xl shadow-sm p-6">
          <h1 className="text-xl font-bold">Admin</h1>
          <p className="mt-2 text-gray-700 text-sm">{msg || "Not authorized."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-gray-600">
              Signed in as <span className="font-medium">{me?.email}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              nav("/login");
            }}
            className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-6 items-start">
          <aside className="bg-white/95 border border-emerald-100 rounded-2xl shadow-sm p-2.5 space-y-1.5 lg:sticky lg:top-4">
            <button
              type="button"
              onClick={() => setTab("dashboard")}
              className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl text-sm font-medium border transition ${
                tab === "dashboard"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-white border-transparent text-gray-700 hover:bg-emerald-50/70 hover:text-emerald-700"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 shrink-0">
                <path d="M4 13h6v7H4zM14 4h6v16h-6zM4 4h6v6H4z" />
              </svg>
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("products");
                setLowStockOnly(false);
              }}
              className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl text-sm font-medium border transition ${
                tab === "products" && !lowStockOnly
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-white border-transparent text-gray-700 hover:bg-emerald-50/70 hover:text-emerald-700"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 shrink-0">
                <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9z" />
                <path d="M4 10h16" />
              </svg>
              Products
            </button>
            <button
              type="button"
              onClick={() => setTab("orders")}
              className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-xl text-sm font-medium border transition ${
                tab === "orders"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-white border-transparent text-gray-700 hover:bg-emerald-50/70 hover:text-emerald-700"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 shrink-0">
                  <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                  <path d="M9 9h6M9 13h6M9 17h4" />
                </svg>
                Orders
              </span>
              {toShipCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">
                  {toShipCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("payments")}
              className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-xl text-sm font-medium border transition ${
                tab === "payments"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-white border-transparent text-gray-700 hover:bg-emerald-50/70 hover:text-emerald-700"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 shrink-0">
                  <path d="M5 5h14v14H5z" />
                  <path d="M9 9h6M9 13h6M9 17h4" />
                </svg>
                Reports
              </span>
              {paymentOrders.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 border border-sky-200 text-sky-700">
                  {paymentOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("users")}
              className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl text-sm font-medium border transition ${
                tab === "users"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-white border-transparent text-gray-700 hover:bg-emerald-50/70 hover:text-emerald-700"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 shrink-0">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 19a7 7 0 0 1 14 0" />
              </svg>
              Users
            </button>
            <button
              type="button"
              onClick={() => setTab("sales")}
              className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl text-sm font-medium border transition ${
                tab === "sales"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-white border-transparent text-gray-700 hover:bg-emerald-50/70 hover:text-emerald-700"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 shrink-0">
                <path d="M4 20h16" />
                <path d="M7 17V11M12 17V7M17 17v-4" />
              </svg>
              Sales
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("products");
                setLowStockOnly(true);
              }}
              className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-xl text-sm font-medium border transition ${
                tab === "products" && lowStockOnly
                  ? "bg-red-50 border-red-200 text-red-700"
                  : lowStockCount > 0
                  ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                  : "bg-white border-transparent text-gray-700 hover:bg-emerald-50/70 hover:text-emerald-700"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 shrink-0">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5" />
                  <circle cx="12" cy="16.5" r=".75" fill="currentColor" stroke="none" />
                </svg>
                Low Stocks
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white/80 border border-red-200">
                {lowStockCount}
              </span>
            </button>

          </aside>

          <div className="min-w-0">

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="mt-0 space-y-6">
            <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Dashboard</h2>
                </div>
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Live Data
                </span>
              </div>

              <div className="mt-6 space-y-4">
                <div className="border border-emerald-100 rounded-2xl p-5 sm:p-6 bg-emerald-50/40">
                  <h3 className="text-sm font-semibold text-gray-700 tracking-wide">Sales Trend Comparison</h3>
                  <p className="text-xs text-gray-600 mt-1">Comparing last 12 months vs last 12 days</p>
                  <div className="mt-4 h-80">
                    <Line data={dashboardSalesTrendData} options={dashboardSalesTrendOptions} />
                  </div>
                </div>

                <div className="border border-teal-100 rounded-2xl p-5 sm:p-6 bg-teal-50/40">
                  <h3 className="text-sm font-semibold text-gray-700 tracking-wide">Users Visit Analytics</h3>
                  <div className="mt-4 h-64">
                    <Bar data={dashboardUsersVisitData} options={dashboardUsersVisitOptions} />
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium text-gray-500">Total Revenue</div>
                    <span className="h-7 w-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
                      ₱
                    </span>
                  </div>
                  <div className="text-xl font-semibold mt-2 text-gray-900">{money(totalRevenueAll)}</div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium text-gray-500">Total Orders</div>
                    <span className="h-7 w-7 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700">
                      #
                    </span>
                  </div>
                  <div className="text-xl font-semibold mt-2 text-gray-900">{orders.length}</div>
                </div>
                <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium text-gray-500">New Customers</div>
                    <span className="h-7 w-7 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-700">
                      +
                    </span>
                  </div>
                  <div className="text-xl font-semibold mt-2 text-gray-900">{newCustomersCount}</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium text-gray-500">Total Deliveries</div>
                    <span className="h-7 w-7 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                      ✓
                    </span>
                  </div>
                  <div className="text-xl font-semibold mt-2 text-gray-900">{salesOrders.length}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PRODUCTS */}
        {tab === "products" && (
          <div className="mt-0">
            <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-900">
                      Products {lowStockOnly && <span className="text-sm text-amber-600 font-medium">(Low Stock)</span>}
                    </h2>
                    <span className="px-3 py-1 text-sm font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {filteredProducts.length}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none">
                    <input
                      value={pSearch}
                      onChange={(e) => setPSearch(e.target.value)}
                      placeholder="Search products..."
                      className="w-full sm:w-72 px-4 py-2.5 pl-10 rounded-lg border border-gray-300 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent hover:border-gray-400 transition"
                    />
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProductForm(true)}
                    className="px-4 py-2.5 rounded-lg bg-emerald-700 text-white font-medium text-sm hover:bg-emerald-800 transition flex items-center justify-center gap-2 shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {editingProductId ? "Edit" : "Add Product"}
                  </button>
                </div>
              </div>

              {pLoading ? (
                <div className="py-16 text-center text-gray-600">Loading products…</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-16 text-center text-gray-600">No products found.</div>
              ) : (
                <div className="mt-6 max-h-150 overflow-y-auto pr-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className="border border-gray-200 rounded-2xl overflow-hidden bg-white hover:shadow-md transition flex flex-col"
                    >
                      <div className="h-48 bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm text-gray-500">No image</span>
                        )}
                      </div>

                      <div className="p-4 sm:p-5 flex flex-col flex-1">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 leading-tight truncate">{p.name}</h3>
                            <p className="text-xs text-gray-600 mt-1">{p.category}</p>
                          </div>
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={() => setProductMenuOpen(productMenuOpen === p.id ? null : p.id)}
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition"
                              title="Actions"
                            >
                              <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>
                            {productMenuOpen === p.id && (
                              <div className="user-menu-dropdown absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                                <button
                                  type="button"
                                  onClick={() => startEditProduct(p)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-t-lg"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeProduct(p.id)}
                                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 border-t rounded-b-lg"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {p.description && (
                          <p className="text-xs text-gray-600 line-clamp-2 mb-3">{p.description}</p>
                        )}

                        <div className="mt-auto space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="text-lg font-bold text-emerald-700">{money(p.price)}</div>
                            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              (p.stock ?? 0) <= 5
                                ? "bg-red-50 text-red-700 border border-red-100"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            }`}>
                              Stock: {p.stock ?? 0}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 text-[10px] text-gray-400">ID: {p.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </div>

            {showProductForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={cancelEdit} />
                <div className="relative w-full max-w-2xl bg-white border border-emerald-100 rounded-2xl shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{editingProductId ? "Edit Product" : "Add New Product"}</h2>
                      <p className="text-sm text-gray-600 mt-1">{editingProductId ? "Update product details" : "Create a new product listing"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-2 hover:bg-gray-100 rounded-lg transition shrink-0"
                      title="Close"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <form className="space-y-6" onSubmit={addProduct}>
                    {/* Basic Info Section */}
                    <div className="space-y-4 pb-4 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">Basic Information</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Product Name *</label>
                        <input
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          placeholder="e.g., Blue Notebook"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea
                          value={form.description}
                          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                          className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-24 resize-none"
                          placeholder="Add product details and features..."
                        />
                      </div>
                    </div>

                    {/* Price & Stock Section */}
                    <div className="space-y-4 pb-4 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">Pricing & Inventory</h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Price (₱) *</label>
                          <input
                            value={form.price}
                            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                            className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Stock Quantity *</label>
                          <input
                            value={form.stock}
                            onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                            className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            type="number"
                            step="1"
                            min="0"
                            placeholder="0"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Category *</label>
                        <input
                          list="admin-category-list"
                          value={form.category}
                          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                          className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                          placeholder="Select or type category..."
                          required
                        />
                        <datalist id="admin-category-list">
                          {categories.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    {/* Options Section */}
                    <div className="space-y-4 pb-4 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">Product Options</h3>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-3">Length Options</label>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {LENGTH_PRESETS.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => toggleOption("length_options", opt)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                                  form.length_options.includes(opt)
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                    : "bg-white border-gray-200 text-gray-600 hover:border-emerald-200 hover:bg-emerald-50/30"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input
                              value={customLength}
                              onChange={(e) => setCustomLength(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              placeholder="Custom..."
                            />
                            <button
                              type="button"
                              onClick={() => {
                                addCustomOption("length_options", customLength);
                                setCustomLength("");
                              }}
                              className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-3">Color Options</label>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {COLOR_PRESETS.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => toggleOption("color_options", opt)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                                  form.color_options.includes(opt)
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                    : "bg-white border-gray-200 text-gray-600 hover:border-emerald-200 hover:bg-emerald-50/30"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input
                              value={customColor}
                              onChange={(e) => setCustomColor(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              placeholder="Custom..."
                            />
                            <button
                              type="button"
                              onClick={() => {
                                addCustomOption("color_options", customColor);
                                setCustomColor("");
                              }}
                              className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Image Section */}
                    <div className="space-y-4 pb-4 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">Product Image</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Image URL</label>
                        <input
                          value={form.image_url}
                          onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                          className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                          placeholder="https://example.com/image.jpg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Upload Image</label>
                        <input
                          type="file"
                          accept="image/*"
                          className="mt-2 block w-full text-sm rounded-lg border border-gray-200 bg-white
                             file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                             file:bg-emerald-50 file:text-emerald-700 file:font-medium hover:file:bg-emerald-100 transition"
                          onChange={(e) => setProductImageFile(e.target.files?.[0] || null)}
                        />
                      </div>

                      {productImagePreview && (
                        <div className="mt-3 p-2 border border-gray-200 rounded-lg bg-gray-50">
                          <img src={productImagePreview} alt="Preview" className="max-h-32 rounded-lg mx-auto" />
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 disabled:opacity-60 transition"
                        disabled={uploadingProductImage}
                      >
                        {uploadingProductImage
                          ? "Uploading…"
                          : editingProductId
                          ? "Update Product"
                          : "Add Product"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                    </div>

                    {msg.text && (
                      <p className={`text-sm font-semibold ${
                        msg.type === "success" ? "text-green-600" : "text-red-600"
                      }`}>
                        {msg.text}
                      </p>
                    )}
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <div className="mt-0 bg-white border border-emerald-100 rounded-2xl shadow-sm p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
                <p className="text-sm text-gray-600 mt-1">Manage and track all customer orders</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div className="relative">
                  <select
                    value={oCategory}
                    onChange={(e) => setOCategory(e.target.value)}
                    className="appearance-none px-4 py-2.5 pr-10 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent cursor-pointer hover:border-gray-400 transition"
                  >
                    <option value="All">All Status</option>
                    <option value="To Ship">To Ship</option>
                    <option value="Out for Delivery">Out for Delivery</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                  <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>

                <div className="relative">
                  <input
                    value={oSearch}
                    onChange={(e) => setOSearch(e.target.value)}
                    placeholder="Search by ID, name..."
                    className="w-full sm:w-64 px-4 py-2.5 pl-10 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent hover:border-gray-400 transition"
                  />
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {oLoading ? (
              <div className="py-16 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                <p className="mt-3 text-gray-600">Loading orders…</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4m0 0L4 7m16 0v10l-8 4m0-4L4 7v10l8 4m0 0l8-4v-10" />
                </svg>
                <p className="mt-3 text-gray-600">No orders found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredOrders.map((o) => {
                  const statusNorm = normalizeOrderStatus(o.status);
                  const statusColors = {
                    "To Ship": "bg-amber-50 border-amber-200 text-amber-700",
                    "Out for Delivery": "bg-sky-50 border-sky-200 text-sky-700",
                    "Completed": "bg-emerald-50 border-emerald-200 text-emerald-700",
                    "Cancelled": "bg-red-50 border-red-200 text-red-700"
                  };

                  return (
                    <div
                      key={o.id}
                      className="bg-white border border-gray-200 hover:border-emerald-200 hover:shadow-md rounded-xl overflow-hidden flex flex-col transition-all duration-200"
                    >
                      {/* Header */}
                      <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Products</div>
                            <div className="text-sm font-semibold text-gray-900 truncate mt-0.5">{getProductNamesFor(o)}</div>
                          </div>
                          <span className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-semibold ${statusColors[statusNorm] || "bg-gray-50 border-gray-200 text-gray-700"}`}>
                            {statusNorm}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-2">
                          <span className="text-sm text-gray-600">Total Amount</span>
                          <span className="text-lg font-bold text-emerald-700">{money(o.total)}</span>
                        </div>

                        <div className="text-xs text-gray-500 mt-2">
                          {o.created_at ? new Date(o.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-5 flex flex-col flex-1 space-y-4">
                        {/* Customer Info */}
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-gray-900">{resolvedOrderName(o)}</div>
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 00.948-.684l1.498-4.493a1 1 0 011.502-.684l1.498 4.493a1 1 0 00.948.684H19a2 2 0 012 2v2H3V5z" />
                            </svg>
                            {resolvedOrderPhone(o)}
                          </div>
                        </div>

                        {/* Address */}
                        <div className="text-sm">
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Delivery Address</div>
                          <div className="text-gray-700 line-clamp-2">
                            {resolvedOrderAddress(o)}
                          </div>
                        </div>

                        {/* Status Control */}
                        <div className="pt-2 border-t border-gray-100 mt-auto">
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                            Update Status
                          </label>
                          <select
                            value={statusNorm}
                            onChange={(e) => updateOrderStatus(o, e.target.value, o.payment_method)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-5 border-t border-gray-100 bg-gray-50/50">
                        <button
                          type="button"
                          onClick={() => setViewOrder(o)}
                          className="w-full px-4 py-2.5 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PAYMENTS */}
        {tab === "payments" && (
          <div className="mt-0 bg-white border border-emerald-100 rounded-2xl shadow-sm p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Delivery Confirmations</h2>
                <p className="text-sm text-gray-600 mt-1">Process and confirm delivery payments</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeliveryHistory(true)}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg border border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  History ({deliveryHistory.length})
                </button>
                <span className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200">
                  {paymentOrders.length} Pending
                </span>
              </div>
            </div>

            {oLoading ? (
              <div className="py-16 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                <p className="mt-3 text-gray-600">Loading deliveries…</p>
              </div>
            ) : paymentOrders.length === 0 ? (
              <div className="py-16 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-3 text-gray-600">No pending deliveries</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {paymentOrders.map((o) => {
                  const draft = getDeliveryDraft(o.id);
                  const isBusy = completingOrderId === o.id;
                  return (
                    <div key={o.id} className="bg-white border border-gray-200 hover:border-emerald-200 hover:shadow-md rounded-xl overflow-hidden transition-all duration-200">
                      {/* Header */}
                      <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Order #{o.id}</div>
                            <div className="text-sm font-semibold text-gray-900 truncate mt-0.5">{getProductNamesFor(o)}</div>
                            <div className="text-sm text-gray-600 mt-2">{resolvedOrderName(o)} • {resolvedOrderPhone(o)}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block px-3 py-1.5 text-xs font-semibold rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                              Out for Delivery
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 wrap-break-word">{resolvedOrderAddress(o)}</div>
                        <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
                          <div>
                            <span className="text-xs text-gray-600">Payment Method</span>
                            <div className="font-semibold text-gray-900">{o.payment_method || "—"}</div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-gray-600">Total Amount</span>
                            <div className="text-lg font-bold text-emerald-700">{money(o.total)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Form */}
                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">Driver Name</label>
                            <input
                              value={draft.driver}
                              onChange={(e) => setDeliveryDraft(o.id, { driver: e.target.value })}
                              placeholder="Enter driver name"
                              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">Delivery Report</label>
                            <textarea
                              value={draft.report}
                              onChange={(e) => setDeliveryDraft(o.id, { report: e.target.value })}
                              placeholder="Report from driver..."
                              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-24 resize-none"
                            />
                          </div>
                        </div>

                        <label className="inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition w-full">
                          <input
                            type="checkbox"
                            checked={draft.safelyDelivered}
                            onChange={(e) => setDeliveryDraft(o.id, { safelyDelivered: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm font-medium text-gray-900">Product safely delivered</span>
                        </label>
                      </div>

                      {/* Actions */}
                      <div className="p-5 border-t border-gray-100 bg-gray-50/50">
                        <button
                          type="button"
                          onClick={() => completePaymentOrder(o)}
                          disabled={isBusy || !draft.safelyDelivered}
                          className="w-full px-4 py-2.5 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          {isBusy ? "Processing…" : "Mark as Completed"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* DELIVERY HISTORY MODAL */}
        {tab === "payments" && showDeliveryHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowDeliveryHistory(false)}
              aria-hidden="true"
            />
            <div className="relative w-full max-w-4xl bg-white border border-emerald-100 rounded-2xl shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Delivery Report History</h2>
                  <p className="text-sm text-gray-600 mt-1">Completed delivery confirmations</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeliveryHistory(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition shrink-0"
                  title="Close"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 flex items-center gap-2">
                <span className="px-3 py-1.5 text-sm font-semibold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  {deliveryHistory.length} Completed
                </span>
              </div>

              {deliveryHistory.length === 0 ? (
                <div className="py-16 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-3 text-gray-600">No delivery reports yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {deliveryHistory.map((historyItem, idx) => (
                    <div key={`${historyItem.orderId}-${idx}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition">
                      {/* Header */}
                      <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Order #{historyItem.orderId}</div>
                            <div className="text-sm font-semibold text-gray-900 truncate mt-0.5">{historyItem.productNames}</div>
                            <div className="text-sm text-gray-600 mt-2">{historyItem.customerName} • {historyItem.customerPhone}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block px-3 py-1.5 text-xs font-semibold rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                              Completed
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 wrap-break-word">{historyItem.customerAddress}</div>
                        <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
                          <div>
                            <span className="text-xs text-gray-600">Driver</span>
                            <div className="font-semibold text-gray-900">{historyItem.driver || "—"}</div>
                          </div>
                          <div className="text-center">
                            <span className="text-xs text-gray-600">Total Amount</span>
                            <div className="text-lg font-bold text-emerald-700">{money(historyItem.total)}</div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-gray-600">Completed</span>
                            <div className="font-semibold text-sm text-gray-900">{new Date(historyItem.completedAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>

                      {/* Report */}
                      <div className="p-5 space-y-4">
                        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                          <div className="text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-2">Delivery Report</div>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">{historyItem.report || "No report provided"}</div>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200">
                          <svg className="h-5 w-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-sm font-medium text-emerald-900">Product safely delivered</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div className="mt-0 bg-white border border-emerald-100 rounded-2xl shadow-sm p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Users</h2>
                <p className="text-sm text-gray-600 mt-1">Manage and monitor all system users</p>
              </div>
              <div className="relative flex-1 sm:flex-none">
                <input
                  value={uSearch}
                  onChange={(e) => setUSearch(e.target.value)}
                  placeholder="Search by name, email..."
                  className="w-full sm:w-72 px-4 py-2.5 pl-10 rounded-lg border border-gray-300 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent hover:border-gray-400 transition"
                />
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {uLoading ? (
              <div className="py-16 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                <p className="mt-3 text-gray-600">Loading users…</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-16 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2h2v-2a11 11 0 00-22 0v2h2z" />
                </svg>
                <p className="mt-3 text-gray-600">No users found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredUsers.map((u) => {
                  const isAdmin = safeLower(u.role) === "admin";
                  const isBanned = u.banned;
                  const statusColor = isBanned ? "bg-red-50 border-red-200 text-red-700" : isAdmin ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-emerald-50 border-emerald-200 text-emerald-700";
                  const statusLabel = isBanned ? "Banned" : isAdmin ? "Admin" : "Active";

                  return (
                    <div
                      key={u.id}
                      className="bg-white border border-gray-200 hover:border-emerald-200 hover:shadow-md rounded-xl overflow-hidden transition-all duration-200 flex flex-col"
                    >
                      {/* Header */}
                      <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">User</div>
                            <div className="text-sm font-semibold text-gray-900 truncate mt-0.5">{u.name || "Unnamed User"}</div>
                          </div>
                          <span className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-semibold ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {u.email || "No email"}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-5 flex-1 space-y-3">
                        {/* Role */}
                        <div>
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Role</div>
                          <div className="text-sm font-medium text-gray-900">{u.role || "User"}</div>
                        </div>

                        {/* Account Status */}
                        <div>
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Account Status</div>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                            <div className={`w-2 h-2 rounded-full ${isBanned ? "bg-red-600" : "bg-emerald-600"}`}></div>
                            <span className={`text-sm font-medium ${isBanned ? "text-red-700" : "text-emerald-700"}`}>
                              {isBanned ? "Account Banned" : "Profile Active"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-5 border-t border-gray-100 bg-gray-50/50">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setUserMenuOpen(userMenuOpen === u.id ? null : u.id)}
                            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                            title="User actions"
                          >
                            <span>Actions</span>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          {userMenuOpen === u.id && (
                            <div className="absolute bottom-full mb-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => {
                                  toggleAdmin(u.id, true);
                                  setUserMenuOpen(null);
                                }}
                                disabled={isAdmin || isBanned}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                              >
                                Make Admin
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  toggleAdmin(u.id, false);
                                  setUserMenuOpen(null);
                                }}
                                disabled={!isAdmin || isBanned}
                                className="w-full text-left px-4 py-2.5 text-sm border-t border-gray-100 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                              >
                                Remove Admin
                              </button>
                              {isBanned ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    unbanUser(u.id);
                                    setUserMenuOpen(null);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-emerald-600 hover:bg-emerald-50 border-t border-gray-100 transition"
                                >
                                  Unban User
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    banUser(u.id);
                                    setUserMenuOpen(null);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100 transition"
                                >
                                  Ban User
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {msg.text && (
              <p className={`mt-4 text-sm font-semibold ${
                msg.type === "success" ? "text-green-600" : "text-red-600"
              }`}>
                {msg.text}
              </p>
            )}
          </div>
        )}

        {/* SALES */}
        {tab === "sales" && (
          <div className="mt-0 bg-white border border-emerald-100 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Sales Analytics</h2>
                <p className="text-sm text-gray-600 mt-1">Analyze completed orders and revenue trends</p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Date Range</label>
                  <div className="relative">
                    <select
                      value={salesDateRange}
                      onChange={(e) => setSalesDateRange(e.target.value)}
                      className="appearance-none w-full sm:w-56 px-4 py-2.5 pr-10 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent cursor-pointer hover:border-gray-400 transition"
                    >
                      <option value="All">All Time</option>
                      <option value="Today">Today</option>
                      <option value="Last 7 Days">Last 7 Days</option>
                      <option value="This Month">This Month</option>
                      <option value="Custom">Custom Range</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSalesFilterMenuOpen(!salesFilterMenuOpen)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition flex items-center justify-center gap-2"
                  title="Custom date range options"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Custom Date Range
                </button>
              </div>
            </div>

            {salesFilterMenuOpen && (
              <div className="w-full sm:w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                <div className="text-sm font-semibold text-gray-900 mb-4">Custom Date Range</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      value={salesDateFrom}
                      onChange={(e) => {
                        setSalesDateRange("Custom");
                        setSalesDateFrom(e.target.value);
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      value={salesDateTo}
                      onChange={(e) => {
                        setSalesDateRange("Custom");
                        setSalesDateTo(e.target.value);
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-gray-200 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSalesDateRange("All");
                        setSalesDateFrom("");
                        setSalesDateTo("");
                        setSalesFilterMenuOpen(false);
                      }}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition font-medium"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalesFilterMenuOpen(false)}
                      className="flex-1 px-3 py-2 text-sm rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition font-medium"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-linear-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Total Income</div>
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-3xl font-bold text-emerald-700">{money(salesIncome)}</div>
                <div className="text-xs text-gray-600 mt-2">From completed orders</div>
              </div>

              <div className="bg-linear-to-br from-sky-50 to-white border border-sky-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Completed Orders</div>
                  <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <div className="text-3xl font-bold text-sky-700">{filteredSalesOrders.length}</div>
                <div className="text-xs text-gray-600 mt-2">In selected period</div>
              </div>

              <div className="bg-linear-to-br from-violet-50 to-white border border-violet-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Products Sold</div>
                  <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div className="text-3xl font-bold text-violet-700">
                  {soldProducts.reduce((sum, item) => sum + Number(item.qty || 0), 0)}
                </div>
                <div className="text-xs text-gray-600 mt-2">Total units sold</div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
                  <h3 className="text-sm font-semibold text-gray-900">Daily Income</h3>
                  <p className="text-xs text-gray-600 mt-1">Revenue by day</p>
                </div>
                <div className="p-5">
                  {salesByDay.length === 0 ? (
                    <p className="text-sm text-gray-600 py-8 text-center">No sales data available</p>
                  ) : (
                    <div className="h-96">
                      <Bar data={salesByDayChartData} options={salesCurrencyBarOptions} />
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
                  <h3 className="text-sm font-semibold text-gray-900">Income by Category</h3>
                  <p className="text-xs text-gray-600 mt-1">Revenue breakdown</p>
                </div>
                <div className="p-5">
                  {salesByCategory.length === 0 ? (
                    <p className="text-sm text-gray-600 py-8 text-center">No category data available</p>
                  ) : (
                    <div className="h-96">
                      <Bar data={salesByCategoryChartData} options={salesCurrencyBarOptions} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Barangay Chart */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white">
                <h3 className="text-sm font-semibold text-gray-900">Buyers by Barangay</h3>
                <p className="text-xs text-gray-600 mt-1">Customer distribution by location</p>
              </div>
              <div className="p-5">
                {salesByBarangay.length === 0 ? (
                  <p className="text-sm text-gray-600 py-8 text-center">No barangay data available</p>
                ) : (
                  <div className="h-96">
                    <Bar data={salesByBarangayChartData} options={salesCountBarOptions} />
                  </div>
                )}
              </div>
            </div>

            {/* Products Sold Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-linear-to-r from-gray-50 to-white flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Top Products Sold</h3>
                  <p className="text-xs text-gray-600 mt-1">Best performing products</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBestBuysOnly(!showBestBuysOnly)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      showBestBuysOnly
                        ? "bg-emerald-700 text-white border-emerald-700"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {showBestBuysOnly ? "Top 10" : "All"}
                  </button>
                  <select
                    value={salesProductCategory}
                    onChange={(e) => setSalesProductCategory(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    {soldProductCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-5">
                {filteredSoldProducts.length === 0 ? (
                  <p className="text-sm text-gray-600 py-8 text-center">No products sold yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600 border-b border-gray-200">
                          <th className="py-3 pr-4 font-semibold">Product</th>
                          <th className="py-3 pr-4 font-semibold">Category</th>
                          <th className="py-3 pr-4 font-semibold text-right">Qty Sold</th>
                          <th className="py-3 pr-4 font-semibold text-right">Income</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSoldProducts.map((item, idx) => (
                          <tr key={`${item.name}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50 transition">
                            <td className="py-3 pr-4 font-medium text-gray-900">{item.name}</td>
                            <td className="py-3 pr-4 text-gray-600">{item.category}</td>
                            <td className="py-3 pr-4 text-right">
                              <span className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium text-xs">{item.qty}</span>
                            </td>
                            <td className="py-3 pr-4 text-right font-semibold text-emerald-700">{money(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* VIEW ORDER MODAL */}
      {viewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewOrder(null)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="p-4 sm:p-5 border-b flex items-start justify-between gap-3 bg-gray-50/60">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Order</div>
                <div className="text-lg font-bold break-all">#{viewOrder.id}</div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded-full bg-black text-white">User</span>
                  <span className="font-semibold text-gray-900">{resolvedOrderName(viewOrder)}</span>
                </div>
                <div className="mt-1 text-sm text-gray-700">{resolvedOrderPhone(viewOrder)}</div>
              </div>

              <button
                type="button"
                onClick={() => setViewOrder(null)}
                className="px-3 py-2 rounded-lg border hover:bg-gray-50 shrink-0 bg-white"
              >
                Close
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className="font-semibold">{normalizeOrderStatus(viewOrder.status)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Payment Status</div>
                  <div className="font-semibold">{paymentStatusLabel(viewOrder)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Total</div>
                  <div className="font-semibold">{money(viewOrder.total)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-500">Shipping Fee</div>
                  <div className="font-semibold">{money(viewOrder.shipping_fee || 0)}</div>
                </div>
                <div className="border rounded-xl p-3 sm:col-span-2">
                  <div className="text-xs text-gray-500">Address</div>
                  <div className="font-semibold wrap-break-word">{resolvedOrderAddress(viewOrder)}</div>
                </div>
              </div>

              {Array.isArray(viewOrder.items) && viewOrder.items.length > 0 && (
                <div className="mt-5">
                  <div className="text-sm font-semibold">Items</div>
                  <div className="mt-2 border rounded-xl overflow-hidden">
                    {viewOrder.items.map((it, idx) => (
                      <div
                        key={idx}
                        className={`p-3 flex items-start justify-between gap-3 ${
                          idx !== 0 ? "border-t" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{it.name}</div>
                          <div className="text-sm text-gray-600">Qty: {it.qty}</div>
                        </div>
                        <div className="shrink-0 font-semibold">{money(it.price)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5">
                <div className="text-sm font-semibold">Raw order data</div>
                <pre className="mt-2 text-xs bg-gray-50 border rounded-xl p-3 overflow-auto max-h-80">
{JSON.stringify(viewOrder, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t flex items-center justify-end gap-2 bg-white">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
                onClick={() => setViewOrder(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
