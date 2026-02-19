import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const ORDER_STATUSES = ["To Ship", "Out for Delivery", "Completed", "Cancelled"];
const PRODUCT_IMG_BUCKET = "product-images";
const DEFAULT_CATEGORIES = ["Notebooks", "Pens", "Pencils", "Paper", "Accessories", "Paintings"];
const CATEGORY_ALIASES = {
  accesories: "accessories",
};

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

  const [tab, setTab] = useState("products"); // dashboard | products | orders | payments | users | sales
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
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setDeliveryHistory(parsed);
    } catch {
      // ignore storage parse errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("admin_delivery_history", JSON.stringify(deliveryHistory));
    } catch {
      // ignore storage write errors
    }
  }, [deliveryHistory]);

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

  const salesTrend = useMemo(() => {
    // Get last 12 months rolling from today
    const now = new Date();
    const monthData = Array(12).fill(0);
    const labels = [];

    // Create labels and initialize data for last 12 months
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleDateString(undefined, { month: "short" });
      labels.push(monthName);
    }

    // Map orders by month (last 12 months)
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
      const amount = Number(order.total || 0);

      if (monthMap.hasOwnProperty(key)) {
        monthMap[key] += amount;
      }
    }

    // Fill monthData array from oldest to newest (last 12 months)
    let idx = 0;
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthData[idx] = monthMap[key] || 0;
      idx += 1;
    }

    return { labels, monthData };
  }, [salesOrders]);

  const salesTrendMax = useMemo(
    () => Math.max(...salesTrend.monthData, 1),
    [salesTrend]
  );

  const salesTrendChart = useMemo(() => {
    const width = 560;
    const height = 220;
    const padLeft = 34;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 34;
    const innerWidth = width - padLeft - padRight;
    const innerHeight = height - padTop - padBottom;

    const toX = (index) => {
      if (salesTrend.labels.length <= 1) return padLeft;
      return padLeft + (index / (salesTrend.labels.length - 1)) * innerWidth;
    };

    const toY = (value) => padTop + innerHeight - (value / salesTrendMax) * innerHeight;

    // Generate smooth curved paths using Catmull-Rom spline interpolation
    const generateSmoothPath = (series) => {
      if (series.length === 0) return "";
      if (series.length === 1) return `M ${toX(0)},${toY(series[0])}`;

      const points = series.map((value, index) => ({
        x: toX(index),
        y: toY(value),
      }));

      // Catmull-Rom spline: creates smooth curve through all points
      const catmullRom = (t, p0, p1, p2, p3) => {
        const t2 = t * t;
        const t3 = t2 * t;
        const tension = 0.5;
        return (
          0.5 *
          (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
        );
      };

      let path = `M ${points[0].x},${points[0].y}`;
      const resolution = 10; // Points per segment for smooth interpolation

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        for (let t = 0; t <= 1; t += 1 / resolution) {
          const x = catmullRom(t, p0.x, p1.x, p2.x, p3.x);
          const y = catmullRom(t, p0.y, p1.y, p2.y, p3.y);
          path += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
        }
      }
      path += ` L ${points[points.length - 1].x},${points[points.length - 1].y}`;

      return path;
    };

    const currentPath = generateSmoothPath(salesTrend.monthData);

    const dataPoints = salesTrend.monthData.map((value, index) => ({
      x: toX(index),
      y: toY(value),
    }));

    const xTicks = salesTrend.labels.map((label, index) => ({ label, x: toX(index) }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: padTop + innerHeight * (1 - ratio),
      value: Math.round(salesTrendMax * ratio),
    }));

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      innerWidth,
      innerHeight,
      currentPath,
      dataPoints,
      xTicks,
      yTicks,
    };
  }, [salesTrend, salesTrendMax]);

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

  const usersVisitMax = useMemo(
    () => Math.max(...usersVisitSeries.map((d) => d.value), 1),
    [usersVisitSeries]
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
            <div className="bg-white border rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Dashboard</h2>
                <div className="text-sm text-gray-600">Analytics Overview</div>
              </div>

              <div className="mt-5 space-y-6">
                <div className="border rounded-2xl p-4 bg-emerald-50/40">
                  <h3 className="text-sm font-semibold text-gray-700">Sales Trend</h3>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
                      Last 12 Months
                    </div>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${salesTrendChart.width} ${salesTrendChart.height}`}
                      className="w-full min-w-95 h-56"
                    >
                      {salesTrendChart.yTicks.map((tick) => (
                        <g key={`grid-${tick.value}`}>
                          <line
                            x1={salesTrendChart.padLeft}
                            y1={tick.y}
                            x2={salesTrendChart.width - salesTrendChart.padRight}
                            y2={tick.y}
                            stroke="rgb(226 232 240)"
                            strokeWidth="1"
                          />
                          <text
                            x={salesTrendChart.padLeft - 6}
                            y={tick.y + 4}
                            textAnchor="end"
                            fontSize="10"
                            fill="rgb(107 114 128)"
                          >
                            {money(tick.value)}
                          </text>
                        </g>
                      ))}

                      <path
                        fill="none"
                        stroke="rgb(5 150 105)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={salesTrendChart.currentPath}
                      />

                      {salesTrendChart.dataPoints.map((point, index) => (
                        <circle
                          key={`dot-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r="3.5"
                          fill="rgb(5 150 105)"
                          stroke="white"
                          strokeWidth="2"
                        />
                      ))}

                      {salesTrendChart.xTicks.map((tick) => (
                        <text
                          key={`x-${tick.label}`}
                          x={tick.x}
                          y={salesTrendChart.height - 10}
                          textAnchor="middle"
                          fontSize="10"
                          fill="rgb(107 114 128)"
                        >
                          {tick.label}
                        </text>
                      ))}
                    </svg>
                  </div>
                </div>

                <div className="border rounded-2xl p-4 bg-teal-50/40">
                  <h3 className="text-sm font-semibold text-gray-700">Users Visit Analytics</h3>
                  <div className="mt-4 h-44 flex items-end gap-2">
                    {usersVisitSeries.map((point) => {
                      const height = Math.max(16, Math.round((point.value / usersVisitMax) * 130));
                      return (
                        <div key={point.key} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-2">
                          <div className="text-[11px] text-gray-500">{point.value}</div>
                          <div
                            className="w-full rounded-t-md bg-emerald-500/80"
                            style={{ height: `${height}px` }}
                            title={`${point.label}: ${point.value}`}
                          />
                          <div className="text-[11px] text-gray-500 truncate w-full text-center">{point.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-xs text-gray-500">Total Revenue</div>
                  <div className="text-xl font-semibold mt-1">{money(totalRevenueAll)}</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-xs text-gray-500">Total Order</div>
                  <div className="text-xl font-semibold mt-1">{orders.length}</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-xs text-gray-500">New Customers</div>
                  <div className="text-xl font-semibold mt-1">{newCustomersCount}</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-xs text-gray-500">Total Deliveries</div>
                  <div className="text-xl font-semibold mt-1">{salesOrders.length}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PRODUCTS */}
        {tab === "products" && (
          <div className="mt-0">
            <div className="bg-white border rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">
                    Products {lowStockOnly ? "(Low Stock)" : ""}
                  </h2>
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-emerald-100 text-emerald-700">
                    {filteredProducts.length} Total
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowProductForm(true)}
                    className="h-10 px-3 rounded-lg border bg-white hover:bg-gray-50 text-sm font-medium"
                  >
                    {editingProductId ? "Edit Product" : "Add Product"}
                  </button>
                  <input
                    value={pSearch}
                    onChange={(e) => setPSearch(e.target.value)}
                    placeholder="Search products..."
                    className="h-10 px-3 rounded-lg border w-64 max-w-full"
                  />
                </div>
              </div>

              {pLoading ? (
                <div className="py-10 text-center text-gray-600">Loading products…</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-10 text-center text-gray-600">No products found.</div>
              ) : (
                <div className="mt-4 max-h-150 overflow-y-auto pr-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
                    {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className="w-full max-w-sm border rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col"
                    >
                      <div className="h-40 bg-gray-100 flex items-center justify-center overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm text-gray-500">No image</span>
                        )}
                      </div>

                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold leading-tight truncate">{p.name}</h3>
                            <p className="text-xs text-gray-600 mt-1 truncate">{p.category}</p>
                          </div>
                          <div className="text-xs text-gray-600 shrink-0">Stock: {p.stock ?? 0}</div>
                        </div>

                        {p.description && (
                          <p className="mt-2 text-sm text-gray-700 line-clamp-3">{p.description}</p>
                        )}

                        <div className="mt-auto pt-3 flex items-center justify-between">
                          <div className="font-semibold">{money(p.price)}</div>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setProductMenuOpen(productMenuOpen === p.id ? null : p.id)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition"
                              title="Actions"
                            >
                              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>
                            {productMenuOpen === p.id && (
                              <div className="user-menu-dropdown absolute right-0 bottom-full mb-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                                <button
                                  type="button"
                                  onClick={() => startEditProduct(p)}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-t-lg"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeProduct(p.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t rounded-b-lg"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-gray-500">ID: {p.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </div>

            {showProductForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40" onClick={cancelEdit} />
                <div className="relative w-full max-w-xl bg-white border rounded-2xl shadow-xl p-5 max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">{editingProductId ? "Edit product" : "Add product"}</h2>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                    >
                      Close
                    </button>
                  </div>

                  <form className="mt-4 space-y-3" onSubmit={addProduct}>
                    <div>
                      <label className="text-sm font-medium">Name</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border min-h-22.5"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium">Price</label>
                        <input
                          value={form.price}
                          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border"
                          type="number"
                          step="0.01"
                          min="0"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Stock</label>
                        <input
                          value={form.stock}
                          onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border"
                          type="number"
                          step="1"
                          min="0"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Category</label>
                      <input
                        list="admin-category-list"
                        value={form.category}
                        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border bg-white"
                        placeholder="Type or select a category"
                      />
                      <datalist id="admin-category-list">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium">Length options (optional)</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {LENGTH_PRESETS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleOption("length_options", opt)}
                              className={`px-3 py-1.5 rounded-full text-xs border transition ${
                                form.length_options.includes(opt)
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                  : "bg-white border-gray-200 text-gray-700 hover:bg-emerald-50/70"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <input
                            value={customLength}
                            onChange={(e) => setCustomLength(e.target.value)}
                            className="h-10 px-3 rounded-lg border w-full sm:w-40"
                            placeholder="Custom"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              addCustomOption("length_options", customLength);
                              setCustomLength("");
                            }}
                            className="h-10 px-4 rounded-lg border bg-white hover:bg-gray-50 text-sm shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Color options (optional)</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {COLOR_PRESETS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleOption("color_options", opt)}
                              className={`px-3 py-1.5 rounded-full text-xs border transition ${
                                form.color_options.includes(opt)
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                  : "bg-white border-gray-200 text-gray-700 hover:bg-emerald-50/70"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <input
                            value={customColor}
                            onChange={(e) => setCustomColor(e.target.value)}
                            className="h-10 px-3 rounded-lg border w-full sm:w-40"
                            placeholder="Custom"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              addCustomOption("color_options", customColor);
                              setCustomColor("");
                            }}
                            className="h-10 px-4 rounded-lg border bg-white hover:bg-gray-50 text-sm shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Image URL (optional)</label>
                      <input
                        value={form.image_url}
                        onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border"
                        placeholder="https://..."
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Image (Choose File)</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-1 block w-full text-sm rounded-lg border border-gray-300 bg-white shadow-sm
                           file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0
                           file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                        onChange={(e) => setProductImageFile(e.target.files?.[0] || null)}
                      />
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-60"
                        disabled={uploadingProductImage}
                      >
                        {uploadingProductImage
                          ? "Uploading image…"
                          : editingProductId
                          ? "Update product"
                          : "Add product"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-lg border hover:bg-gray-50"
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
          <div className="mt-0 bg-white border rounded-2xl shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Orders</h2>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <select
                  value={oCategory}
                  onChange={(e) => setOCategory(e.target.value)}
                  className="px-3 py-2 rounded-lg border bg-white"
                >
                  <option value="All">All</option>
                  <option value="To Ship">To Ship</option>
                  <option value="Out for Delivery">Out for Delivery</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

                <input
                  value={oSearch}
                  onChange={(e) => setOSearch(e.target.value)}
                  placeholder="Search orders..."
                  className="px-3 py-2 rounded-lg border w-64 max-w-full"
                />
              </div>
            </div>

            {oLoading ? (
              <div className="py-10 text-center text-gray-600">Loading orders…</div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-10 text-center text-gray-600">No orders found.</div>
            ) : (
              <div className="mt-4 max-h-150 overflow-y-auto pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
                  {filteredOrders.map((o) => (
                  <div
                    key={o.id}
                    className="w-full max-w-sm bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col"
                  >
                    <div className="p-4 border-b bg-gray-50/60">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-gray-500">Products</div>
                          <div className="font-semibold text-gray-900 truncate">{getProductNamesFor(o)}</div>
                        </div>
                        <span className="shrink-0 text-xs px-2 py-1 rounded-full border bg-white text-gray-700">
                          {normalizeOrderStatus(o.status)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-sm text-gray-600">Total</div>
                        <div className="font-semibold">{money(o.total)}</div>
                      </div>

                      <div className="mt-2 text-xs text-gray-500">
                        {o.created_at ? new Date(o.created_at).toLocaleString() : ""}
                      </div>
                    </div>

                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 truncate">
                            {resolvedOrderName(o)}
                          </div>

                          <div className="mt-1 text-sm text-gray-700 truncate">
                            {resolvedOrderPhone(o)}
                          </div>

                          <div className="mt-2 text-sm text-gray-600 wrap-break-word line-clamp-2">
                            <span className="font-medium text-gray-700">Address:</span>{" "}
                            {resolvedOrderAddress(o)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t">
                        <div className="text-sm text-gray-700 font-medium mb-2">Status</div>
                        <select
                          value={normalizeOrderStatus(o.status)}
                          onChange={(e) => updateOrderStatus(o, e.target.value, o.payment_method)}
                          className="w-full px-3 py-2 rounded-lg border bg-white"
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-auto pt-4">
                        <button
                          type="button"
                          onClick={() => setViewOrder(o)}
                          className="w-full px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 font-medium"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PAYMENTS */}
        {tab === "payments" && (
          <div className="mt-0 bg-white border rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Payments & Delivery Confirmation</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeliveryHistory(true)}
                  className="px-3 py-1 text-sm font-semibold rounded-full border border-teal-200 text-teal-700 hover:bg-teal-50"
                >
                  History ({deliveryHistory.length})
                </button>
                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-emerald-100 text-emerald-700">
                  {paymentOrders.length} Out for Delivery
                </span>
              </div>
            </div>

            {oLoading ? (
              <div className="py-10 text-center text-gray-600">Loading delivery payments…</div>
            ) : paymentOrders.length === 0 ? (
              <div className="py-10 text-center text-gray-600">No out-for-delivery orders to process.</div>
            ) : (
              <div className="mt-4 max-h-150 overflow-y-auto pr-2 space-y-4">
                {paymentOrders.map((o) => {
                  const draft = getDeliveryDraft(o.id);
                  const isBusy = completingOrderId === o.id;
                  return (
                    <div key={o.id} className="border rounded-2xl p-4 bg-gray-50">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-gray-500">Order #{o.id}</div>
                          <div className="font-semibold text-gray-900 mt-1">{getProductNamesFor(o)}</div>
                          <div className="text-sm text-gray-700 mt-1">{resolvedOrderName(o)} • {resolvedOrderPhone(o)}</div>
                          <div className="text-sm text-gray-600 mt-1 wrap-break-word">{resolvedOrderAddress(o)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Payment Method</div>
                          <div className="font-semibold">{o.payment_method || "—"}</div>
                          <div className="text-xs text-gray-500 mt-2">Total</div>
                          <div className="font-semibold">{money(o.total)}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Driver</label>
                          <input
                            value={draft.driver}
                            onChange={(e) => setDeliveryDraft(o.id, { driver: e.target.value })}
                            placeholder="Enter driver name"
                            className="mt-1 w-full px-3 py-2 rounded-lg border bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Delivery Report</label>
                          <textarea
                            value={draft.report}
                            onChange={(e) => setDeliveryDraft(o.id, { report: e.target.value })}
                            placeholder="Report from rider/driver"
                            className="mt-1 w-full px-3 py-2 rounded-lg border bg-white min-h-22.5"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={draft.safelyDelivered}
                            onChange={(e) => setDeliveryDraft(o.id, { safelyDelivered: e.target.checked })}
                          />
                          Product safely delivered
                        </label>

                        <button
                          type="button"
                          onClick={() => completePaymentOrder(o)}
                          disabled={isBusy || !draft.safelyDelivered}
                          className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {isBusy ? "Completing…" : "Mark as Completed"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* REPORT HISTORY */}
        {tab === "payments" && showDeliveryHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              className="absolute inset-0"
              onClick={() => setShowDeliveryHistory(false)}
              aria-hidden="true"
            />
            <div className="relative w-full max-w-4xl bg-white border rounded-2xl shadow-xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">Delivery Report History</h2>
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-teal-100 text-teal-700">
                    {deliveryHistory.length} Completed
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeliveryHistory(false)}
                  className="px-3 py-1 text-sm font-semibold rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              {deliveryHistory.length === 0 ? (
                <div className="py-10 text-center text-gray-600">No delivery reports yet.</div>
              ) : (
                <div className="mt-4 max-h-[70vh] overflow-y-auto pr-2 space-y-4">
                  {deliveryHistory.map((historyItem, idx) => (
                    <div key={`${historyItem.orderId}-${idx}`} className="border rounded-2xl p-4 bg-teal-50/50">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-gray-500">Order #{historyItem.orderId}</div>
                          <div className="font-semibold text-gray-900 mt-1">{historyItem.productNames}</div>
                          <div className="text-sm text-gray-700 mt-1">{historyItem.customerName} • {historyItem.customerPhone}</div>
                          <div className="text-sm text-gray-600 mt-1 wrap-break-word">{historyItem.customerAddress}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Completed At</div>
                          <div className="font-semibold text-sm">{new Date(historyItem.completedAt).toLocaleString()}</div>
                          <div className="text-xs text-gray-500 mt-2">Driver</div>
                          <div className="font-semibold text-sm">{historyItem.driver}</div>
                          <div className="text-xs text-gray-500 mt-2">Total</div>
                          <div className="font-semibold">{money(historyItem.total)}</div>
                        </div>
                      </div>

                      <div className="mt-4 p-3 rounded-lg bg-white border border-teal-200">
                        <div className="text-xs font-semibold text-gray-600 mb-2">Delivery Report</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">{historyItem.report}</div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <svg className="h-4 w-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-600">Product safely delivered</span>
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
          <div className="mt-0 bg-white border rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Users</h2>
              <input
                value={uSearch}
                onChange={(e) => setUSearch(e.target.value)}
                placeholder="Search users..."
                className="px-3 py-2 rounded-lg border w-64 max-w-full"
              />
            </div>

            {uLoading ? (
              <div className="py-10 text-center text-gray-600">Loading users…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-10 text-center text-gray-600">No users found.</div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4 w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="py-2 pr-4 font-medium">{u.name || "—"}</td>
                        <td className="py-2 pr-4">{u.email || "—"}</td>
                        <td className="py-2 pr-4">{u.role || "—"}</td>
                        <td className="py-2 pr-4">
                          {u.banned ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Banned</span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Active</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 relative">
                          <button
                            type="button"
                            onClick={() => setUserMenuOpen(userMenuOpen === u.id ? null : u.id)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition"
                            title="Actions"
                          >
                            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          {userMenuOpen === u.id && (
                            <div className="absolute right-full mr-2 top-0 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => toggleAdmin(u.id, true)}
                                disabled={safeLower(u.role) === "admin" || u.banned}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-t-lg"
                              >
                                Make Admin
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleAdmin(u.id, false)}
                                disabled={safeLower(u.role) !== "admin" || u.banned}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed border-t"
                              >
                                Remove Admin
                              </button>
                              {u.banned ? (
                                <button
                                  type="button"
                                  onClick={() => unbanUser(u.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 border-t rounded-b-lg"
                                >
                                  Unban User
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => banUser(u.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t rounded-b-lg"
                                >
                                  Ban User
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {msg.text && (
                  <p className={`mt-3 text-sm font-semibold ${
                    msg.type === "success" ? "text-green-600" : "text-red-600"
                  }`}>
                    {msg.text}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* SALES */}
        {tab === "sales" && (
          <div className="mt-0 bg-white border rounded-2xl shadow-sm p-5 space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Sales</h2>
              <div className="text-sm text-gray-600">Based on Completed orders</div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-gray-600">Date Range</label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={salesDateRange}
                      onChange={(e) => setSalesDateRange(e.target.value)}
                      className="block w-48 sm:w-56 pl-3 pr-10 py-2 rounded-lg border bg-white text-sm appearance-none"
                    >
                      <option value="All">All</option>
                      <option value="Today">Today</option>
                      <option value="Last 7 Days">Last 7 Days</option>
                      <option value="This Month">This Month</option>
                      <option value="Custom">Custom</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
                    >
                      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
                    </svg>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSalesFilterMenuOpen(!salesFilterMenuOpen)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition border bg-white"
                      title="Date range options"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {salesFilterMenuOpen && (
                      <div className="user-menu-dropdown absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                        <div className="text-xs text-gray-600 font-medium mb-2">Literal Date Range</div>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-gray-500">From</label>
                            <input
                              type="date"
                              value={salesDateFrom}
                              onChange={(e) => {
                                setSalesDateRange("Custom");
                                setSalesDateFrom(e.target.value);
                              }}
                              className="mt-1 w-full px-3 py-2 rounded-lg border bg-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">To</label>
                            <input
                              type="date"
                              value={salesDateTo}
                              onChange={(e) => {
                                setSalesDateRange("Custom");
                                setSalesDateTo(e.target.value);
                              }}
                              className="mt-1 w-full px-3 py-2 rounded-lg border bg-white text-sm"
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSalesDateRange("All");
                              setSalesDateFrom("");
                              setSalesDateTo("");
                              setSalesFilterMenuOpen(false);
                            }}
                            className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => setSalesFilterMenuOpen(false)}
                            className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="border rounded-xl p-3 bg-gray-50">
                <div className="text-xs text-gray-500">Total Income</div>
                <div className="text-xl font-semibold mt-1">{money(salesIncome)}</div>
              </div>
              <div className="border rounded-xl p-3 bg-gray-50">
                <div className="text-xs text-gray-500">Completed Orders</div>
                <div className="text-xl font-semibold mt-1">{filteredSalesOrders.length}</div>
              </div>
              <div className="border rounded-xl p-3 bg-gray-50">
                <div className="text-xs text-gray-500">Products Sold</div>
                <div className="text-xl font-semibold mt-1">
                  {soldProducts.reduce((sum, item) => sum + Number(item.qty || 0), 0)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3">Income by Day</h3>
                {salesByDay.length === 0 ? (
                  <p className="text-sm text-gray-600">No sales data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {salesByDay.map((entry) => {
                      const max = Math.max(...salesByDay.map((x) => x.amount), 1);
                      const widthPct = (entry.amount / max) * 100;
                      return (
                        <div key={entry.day}>
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>{entry.day}</span>
                            <span>{money(entry.amount)}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-600" style={{ width: `${widthPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3">Income by Category</h3>
                {salesByCategory.length === 0 ? (
                  <p className="text-sm text-gray-600">No category sales data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {salesByCategory.map((entry) => {
                      const max = Math.max(...salesByCategory.map((x) => x.amount), 1);
                      const widthPct = (entry.amount / max) * 100;
                      return (
                        <div key={entry.category}>
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>{entry.category}</span>
                            <span>{money(entry.amount)}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600" style={{ width: `${widthPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Buyers by Barangay</h3>
              {salesByBarangay.length === 0 ? (
                <p className="text-sm text-gray-600">No barangay data yet.</p>
              ) : (
                <div className="space-y-2">
                  {salesByBarangay.map((entry) => {
                    const max = Math.max(...salesByBarangay.map((x) => x.count), 1);
                    const widthPct = (entry.count / max) * 100;
                    return (
                      <div key={entry.barangay}>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>{entry.barangay}</span>
                          <span>{entry.count} buyer{entry.count > 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-600" style={{ width: `${widthPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold">Products Sold</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBestBuysOnly(!showBestBuysOnly)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      showBestBuysOnly
                        ? "bg-emerald-700 text-white border-emerald-700"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {showBestBuysOnly ? "Showing Top 10" : "Best Buys"}
                  </button>
                  <select
                    value={salesProductCategory}
                    onChange={(e) => setSalesProductCategory(e.target.value)}
                    className="px-3 py-2 rounded-lg border bg-white text-sm"
                  >
                    {soldProductCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {filteredSoldProducts.length === 0 ? (
                <p className="text-sm text-gray-600">No products sold yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600 border-b">
                        <th className="py-2 pr-4">Product</th>
                        <th className="py-2 pr-4">Category</th>
                        <th className="py-2 pr-4">Qty Sold</th>
                        <th className="py-2 pr-4">Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSoldProducts.map((item, idx) => (
                        <tr key={`${item.name}-${idx}`} className="border-b last:border-b-0">
                          <td className="py-2 pr-4 font-medium">{item.name}</td>
                          <td className="py-2 pr-4">{item.category}</td>
                          <td className="py-2 pr-4">{item.qty}</td>
                          <td className="py-2 pr-4 font-semibold">{money(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
