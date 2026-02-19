import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import QuickCheckoutModal from "../components/QuickCheckoutModal";

const NEW_ARRIVALS_LIMIT = 8;
const PRODUCT_IMG_BUCKET = "product-images";

function money(n) {
  return `₱${Number(n || 0).toFixed(2)}`;
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

function normalizeOptionList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeOptions(options) {
  if (!options) return {};
  const next = {};
  if (options.length) next.length = options.length;
  if (options.color) next.color = options.color;
  return next;
}

function safeLower(x) {
  return String(x || "").toLowerCase();
}

function makeFileName(file) {
  const ext = (file?.name || "png").split(".").pop();
  const id =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()}`.replace(/\./g, "");
  return `${id}.${ext}`;
}

async function uploadProductImage(file) {
  if (!file) return null;

  const fileName = makeFileName(file);
  const filePath = `products/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMG_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PRODUCT_IMG_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl || null;
}

function ProductCard({
  product,
  session,
  isAdmin,
  onAdd,
  onUpdateImage,
  savingImage,
}) {
  const inStock = Number(product?.stock || 0) > 0;

  return (
    <div className="w-full bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
      <div className="relative bg-gray-100 h-44 overflow-hidden">
        <span className="absolute top-3 left-3 px-3 py-1 text-xs font-semibold rounded-full bg-orange-400 text-white">
          NEW
        </span>

        {session && isAdmin && (
          <label className="absolute top-3 right-3 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onUpdateImage(product?.id, e.target.files?.[0] || null)}
              disabled={savingImage}
            />
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-black text-white hover:opacity-90">
              {savingImage ? "Uploading…" : "Edit image"}
            </span>
          </label>
        )}

        {product?.image_url ? (
          <img
            src={product.image_url}
            alt={product?.name || "Product"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">
            No image
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="min-w-0">
          <h3 className="font-bold text-[#0A2540] leading-tight truncate">{product?.name || "Untitled"}</h3>

          {product?.description ? (
            <p className="mt-2 text-sm text-gray-700 line-clamp-3">{product.description}</p>
          ) : (
            <p className="mt-2 text-sm text-gray-500 line-clamp-3">No description yet.</p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <div className={`flex items-center gap-2 ${inStock ? "text-green-700" : "text-gray-500"}`}>
            <span className="text-base">🛒</span>
            <span className="font-medium">{inStock ? "In Stock" : "Out of Stock"}</span>
          </div>
          <div className="text-gray-600">Stock: {Number(product?.stock || 0)}</div>
        </div>

        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <div className="text-lg font-bold text-black">{money(product?.price)}</div>
          <button
            onClick={() => onAdd(product)}
            disabled={!inStock}
            className="w-10 h-10 rounded-full bg-orange-400 text-white flex items-center justify-center text-xl font-bold hover:opacity-90 disabled:opacity-50"
            aria-label={`Add ${product?.name || "product"} to cart`}
            title="Add to cart"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h2l2 10h10l2-7H6" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="17" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home({ session, fullName, role, isBanned }) {
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const displayName = (fullName || "").trim() || session?.user?.email?.split("@")?.[0] || "User";

  const [allProducts, setAllProducts] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loadingSlideshow, setLoadingSlideshow] = useState(true);
  const [slideshowErr, setSlideshowErr] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [savingImageId, setSavingImageId] = useState(null);

  // Modal and Buy Now states
  const [buyNowProduct, setBuyNowProduct] = useState(null);
  const [buyNowQty, setBuyNowQty] = useState(1);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [buyNowOptions, setBuyNowOptions] = useState(null);
  const [quickCheckoutOpen, setQuickCheckoutOpen] = useState(false);
  const [quickCheckoutItem, setQuickCheckoutItem] = useState(null);
  const [toast, setToast] = useState({ message: "", visible: false });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [checkingReviewEligibility, setCheckingReviewEligibility] = useState(false);
  const [ratingsByProduct, setRatingsByProduct] = useState({});
  const [selectedLength, setSelectedLength] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [optionError, setOptionError] = useState("");

  function getProductOptions(product) {
    return {
      lengthOptions: normalizeOptionList(product?.length_options),
      colorOptions: normalizeOptionList(product?.color_options),
    };
  }

  function makeOptionsKey(options) {
    const normalized = normalizeOptions(options);
    return JSON.stringify(normalized);
  }

  // Admin check: prefer role passed from App to avoid duplicate DB queries
  useEffect(() => {
    let alive = true;

    if (role != null) {
      setIsAdmin(safeLower(role) === "admin");
      return () => {
        alive = false;
      };
    }

    async function checkAdmin() {
      setIsAdmin(false);
      if (!session?.user?.id) return;

      const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();

      if (!alive) return;

      if (error) {
        setIsAdmin(false);
        return;
      }

      setIsAdmin(safeLower(profile?.role) === "admin");
    }

    checkAdmin();
    return () => {
      alive = false;
    };
  }, [session?.user?.id, role]);

  async function fetchSlideshow() {
    setLoadingSlideshow(true);
    setSlideshowErr("");
    if (allProducts.length > 0) setCurrentSlide(0);

    try {
      const timeoutMs = 60000;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeoutMs)
      );

      async function callWithRetry(fn, retries = 2, delayMs = 400) {
        let lastErr;
        for (let i = 0; i <= retries; i++) {
          try {
            return await fn();
          } catch (err) {
            lastErr = err;
            if (i < retries) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
          }
        }
        throw lastErr;
      }

      const q = supabase.from("products").select("*").order("id", { ascending: false });
      
      const res = await callWithRetry(
        () => Promise.race([q, timeout]),
        2,
        400
      );

      console.debug("[Home] slideshow result:", { hasData: !!res?.data, count: res?.data?.length || 0, error: res?.error?.message });

      if (!isMountedRef.current) return;

      if (res?.error) {
        setSlideshowErr(res.error.message || "Failed to load slideshow.");
        setAllProducts([]);
        setRatingsByProduct({});
      } else {
        const rows = Array.isArray(res.data) ? res.data : [];
        setAllProducts(rows);
        await loadRatingsForProducts(rows);
      }
    } catch (e) {
      console.error("[Home] fetchSlideshow error:", e);
      if (!isMountedRef.current) return;
      setSlideshowErr(e?.message || "Failed to load slideshow.");
      setAllProducts([]);
      setRatingsByProduct({});
      try {
        const { setSupabaseError } = await import("../utils/supabaseDebug");
        setSupabaseError(`Slideshow: ${e?.message || String(e)}`);
      } catch (_) {}
    } finally {
      if (isMountedRef.current) setLoadingSlideshow(false);
    }
  }

  // Fetch slideshow products on mount
  useEffect(() => {
    fetchSlideshow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advance slideshow every 5 seconds
  useEffect(() => {
    const slideshowProds = allProducts.slice(0, 12);
    if (slideshowProds.length === 0) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slideshowProds.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [allProducts.length]);

  function addToCart(product, options = null) {
    if (!session) {
      navigate("/login");
      return;
    }
    if (isBanned) {
      setToast({ message: `Your account is suspended`, visible: true });
      setTimeout(() => setToast({ message: "", visible: false }), 3000);
      return;
    }
    if (!product?.id) return;

    const optionsKey = makeOptionsKey(options);

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");

    const item = {
      product_id: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      qty: 1,
      image_url: product.image_url || null,
      options: normalizeOptions(options),
      options_key: optionsKey,
    };

    const idx = cart.findIndex((x) => x.product_id === item.product_id && (x.options_key || "") === optionsKey);
    if (idx >= 0) cart[idx].qty += 1;
    else cart.push(item);

    localStorage.setItem("cart", JSON.stringify(cart));
    
    // Show toast instead of redirecting
    setToast({ message: `Added to cart`, visible: true });
    setTimeout(() => setToast({ message: "", visible: false }), 2000);
  }

  function openBuyNow(product, options = null) {
    if (!session) {
      navigate("/login");
      return;
    }
    if (isBanned) {
      setToast({ message: `Your account is suspended`, visible: true });
      setTimeout(() => setToast({ message: "", visible: false }), 3000);
      return;
    }
    setBuyNowProduct(product);
    setBuyNowOptions(normalizeOptions(options));
    setBuyNowQty(1);
    setBuyNowOpen(true);
  }

  async function loadRatingsForProducts(productRows) {
    const ids = Array.from(new Set((productRows || []).map((p) => p?.id).filter(Boolean)));
    if (!ids.length) {
      setRatingsByProduct({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("product_id, rating")
        .in("product_id", ids);

      if (error) throw error;

      const grouped = {};
      for (const row of data || []) {
        const pid = row.product_id;
        if (!grouped[pid]) grouped[pid] = { sum: 0, count: 0 };
        grouped[pid].sum += Number(row.rating || 0);
        grouped[pid].count += 1;
      }

      const next = {};
      for (const id of ids) {
        const item = grouped[id];
        next[id] = item
          ? { avg: item.sum / item.count, count: item.count }
          : { avg: 0, count: 0 };
      }
      setRatingsByProduct(next);
    } catch {
      setRatingsByProduct({});
    }
  }

  async function loadReviews(productId) {
    if (!productId) return;
    setReviewsLoading(true);
    setReviewsError("");

    try {
      const { data: reviewData, error: reviewError } = await supabase
        .from("product_reviews")
        .select("id, user_id, rating, comment, created_at")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (reviewError) throw reviewError;

      const rows = Array.isArray(reviewData) ? reviewData : [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

      let profileMap = {};
      if (userIds.length) {
        const { data: profileRows } = await supabase
          .from("public_profiles")
          .select("id, full_name")
          .in("id", userIds);

        profileMap = (profileRows || []).reduce((acc, p) => {
          acc[p.id] = (p.full_name || "").trim() || "User";
          return acc;
        }, {});
      }

      setReviews(
        rows.map((r) => ({
          ...r,
          profile_name: profileMap[r.user_id] || "User",
        }))
      );
    } catch (e) {
      setReviews([]);
      setReviewsError(e?.message || "Failed to load reviews.");
    } finally {
      setReviewsLoading(false);
    }
  }

  async function checkCanReview(productId) {
    if (!session?.user?.id || !productId) return false;

    const { data, error } = await supabase
      .from("orders")
      .select("status, items")
      .eq("user_id", session.user.id)
      .eq("status", "Completed");

    if (error) return false;

    return (data || []).some((o) =>
      normalizeItems(o.items).some((item) => Number(item?.product_id) === Number(productId))
    );
  }

  async function openProductDetails(product) {
    setSelectedProduct(product);
    setReviewRating(5);
    setReviewComment("");
    setSelectedLength("");
    setSelectedColor("");
    setOptionError("");
    setDetailsOpen(true);
    setCheckingReviewEligibility(true);

    await loadReviews(product?.id);

    const eligible = await checkCanReview(product?.id);
    setCanReview(eligible);

    setCheckingReviewEligibility(false);
  }

  async function submitReview() {
    if (!session) return navigate("/login");
    if (!selectedProduct?.id) return;

    if (!canReview) {
      setReviewsError("You can only review products from completed orders.");
      return;
    }

    const comment = reviewComment.trim();
    if (!comment) {
      setReviewsError("Please enter a comment.");
      return;
    }

    setReviewSubmitting(true);
    setReviewsError("");

    try {
      const payload = {
        product_id: selectedProduct.id,
        user_id: session.user.id,
        rating: Number(reviewRating || 5),
        comment,
      };

      const { error } = await supabase.from("product_reviews").insert(payload);
      if (error) throw error;

      setReviewComment("");
      setReviewRating(5);
      await loadReviews(selectedProduct.id);
      await loadRatingsForProducts(allProducts);
    } catch (e) {
      setReviewsError(e?.message || "Failed to submit review.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  function confirmBuyNow() {
    if (!buyNowProduct) return;
    
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const optionsKey = makeOptionsKey(buyNowOptions);
    const idx = cart.findIndex((x) => x.product_id === buyNowProduct.id && (x.options_key || "") === optionsKey);

    if (idx >= 0) {
      cart[idx].qty += Number(buyNowQty);
    } else {
      cart.push({
        product_id: buyNowProduct.id,
        name: buyNowProduct.name,
        price: Number(buyNowProduct.price || 0),
        qty: Number(buyNowQty),
        image_url: buyNowProduct.image_url || null,
        options: normalizeOptions(buyNowOptions),
        options_key: optionsKey,
      });
    }

    const checkoutItem = {
      product_id: buyNowProduct.id,
      name: buyNowProduct.name,
      price: Number(buyNowProduct.price || 0),
      qty: Number(buyNowQty),
      image_url: buyNowProduct.image_url || null,
      options: normalizeOptions(buyNowOptions),
      options_key: optionsKey,
    };

    localStorage.setItem("cart", JSON.stringify(cart));
    setBuyNowOpen(false);
    setQuickCheckoutItem(checkoutItem);
    setQuickCheckoutOpen(true);
  }

  async function handleUpdateImage(productId, file) {
    if (!file || !productId) return;

    try {
      setSavingImageId(productId);

      const url = await uploadProductImage(file);

      const { error } = await supabase.from("products").update({ image_url: url }).eq("id", productId);

      if (error) {
        setSlideshowErr(error.message);
        return;
      }

      setAllProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, image_url: url } : p)));
    } catch (e) {
      setSlideshowErr(e?.message || "Upload failed.");
    } finally {
      setSavingImageId(null);
    }
  }

  const slideshowProducts = useMemo(() => allProducts.slice(0, 12), [allProducts]);

  const currentProduct = useMemo(() => slideshowProducts[currentSlide] || null, [slideshowProducts, currentSlide]);

  const selectedReviewStats = useMemo(() => {
    if (!selectedProduct?.id) return { avg: 0, count: 0 };
    return ratingsByProduct[selectedProduct.id] || { avg: 0, count: 0 };
  }, [ratingsByProduct, selectedProduct?.id]);

  const selectedOptions = useMemo(() => {
    if (!selectedProduct) return { lengthOptions: [], colorOptions: [] };
    return getProductOptions(selectedProduct);
  }, [selectedProduct]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 bg-white rounded-2xl mt-6 mb-6 shadow-sm">
      {isBanned && (
        <div className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50 p-6 flex items-start gap-4">
          <div className="text-4xl">🚫</div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-red-900">Account Suspended</h2>
            <p className="text-red-800 mt-2">
              Your account has been suspended and you cannot make purchases at this time. If you believe this is a mistake, please contact our support team.
            </p>
          </div>
        </div>
      )}

      <h1 className="text-4xl font-bold tracking-tight text-[#0A2540] text-center">Adriano School Supplies</h1>

      <p className="mt-3 text-lg text-gray-700 text-center">Your complete destination for quality school essentials.</p>

      {/* PRODUCT SHOWCASE */}
      <section className="mt-10">
        {loadingSlideshow ? (
          <div className="rounded-2xl border border-emerald-100 bg-white p-12 text-center">
            <div
              className="mx-auto h-12 w-12 rounded-full border-4 border-emerald-100 border-t-emerald-600"
              style={{ animation: "spinner-rotate 0.9s linear infinite, spinner-color-cycle 2.4s linear infinite" }}
            />
            <div className="mt-4 text-sm text-emerald-700 font-semibold">Loading products…</div>
          </div>
        ) : slideshowErr ? (
          <div className="rounded-2xl border border-emerald-900/20 bg-emerald-50 p-6">
            <div className="text-sm text-emerald-700 font-semibold">Slideshow unavailable</div>
            <div className="text-sm text-emerald-600 mt-2">{slideshowErr}</div>
          </div>
        ) : allProducts.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-12 text-center text-emerald-700">
            <div className="text-lg font-semibold">No products available.</div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Featured Product Slide (if available) */}
            {currentProduct && (
              <div className="rounded-2xl overflow-hidden bg-white border border-emerald-100 shadow-lg">
                {/* Header with gradient */}
                <div className="p-5 sm:p-6 border-b border-emerald-100 bg-linear-to-r from-emerald-50 to-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Featured Product</div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-emerald-900 mt-1">{currentProduct.name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {Number(currentProduct.stock || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                          In Stock
                        </span>
                      )}
                      {Number(currentProduct.stock || 0) === 0 && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                          <span className="w-2 h-2 rounded-full bg-red-600"></span>
                          Out of Stock
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 sm:p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Image */}
                    <div className="flex items-center justify-center bg-emerald-50 rounded-2xl h-80 overflow-hidden">
                      {currentProduct.image_url ? (
                        <img
                          src={currentProduct.image_url}
                          alt={currentProduct.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-emerald-300">No image</span>
                      )}
                    </div>

                    {/* Info & Actions */}
                    <div className="flex flex-col justify-between">
                      <div className="space-y-4">
                        <div>
                          <p className="text-gray-700 leading-relaxed line-clamp-4">{currentProduct.description || "No description available."}</p>
                        </div>
                      </div>

                      {/* Price & Actions */}
                      <div className="space-y-4 pt-6 border-t border-gray-100">
                        {/* Rating */}
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                          <span className="text-sm font-semibold text-amber-900">
                            {(ratingsByProduct[currentProduct.id]?.count || 0) > 0
                              ? `${ratingsByProduct[currentProduct.id].avg.toFixed(1)} ★`
                              : "No ratings"}
                          </span>
                          <span className="text-xs text-amber-700">
                            {(ratingsByProduct[currentProduct.id]?.count || 0)} review{(ratingsByProduct[currentProduct.id]?.count || 0) !== 1 ? "s" : ""}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-3">
                          <div className="text-4xl font-bold text-emerald-700">₱{Number(currentProduct.price || 0).toFixed(2)}</div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const { lengthOptions, colorOptions } = getProductOptions(currentProduct);
                              if (lengthOptions.length || colorOptions.length) {
                                openProductDetails(currentProduct);
                                return;
                              }
                              addToCart(currentProduct);
                            }}
                            disabled={Number(currentProduct.stock || 0) === 0}
                            className="flex-1 px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm flex items-center justify-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                          >
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 4h2l2 10h10l2-7H6" />
                              <circle cx="9" cy="19" r="1.5" />
                              <circle cx="17" cy="19" r="1.5" />
                            </svg>
                            Add to Cart
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const { lengthOptions, colorOptions } = getProductOptions(currentProduct);
                              if (lengthOptions.length || colorOptions.length) {
                                openProductDetails(currentProduct);
                                return;
                              }
                              openBuyNow(currentProduct);
                            }}
                            disabled={Number(currentProduct.stock || 0) === 0}
                            className="flex-1 px-4 py-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                          >
                            Buy Now
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4 px-6 py-4 bg-linear-to-r from-gray-50 to-white border-t border-emerald-100">
                  <button
                    onClick={() => setCurrentSlide((prev) => (prev - 1 + slideshowProducts.length) % slideshowProducts.length)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 font-medium text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                  </button>

                  <div className="text-sm font-semibold text-emerald-700 px-4 py-2 rounded-lg bg-emerald-50">
                    {currentSlide + 1} / {slideshowProducts.length}
                  </div>

                  <button
                    onClick={() => setCurrentSlide((prev) => (prev + 1) % slideshowProducts.length)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 font-medium text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                {/* Slide Indicators */}
                <div className="flex justify-center gap-2 px-6 py-4 bg-white flex-wrap">
                  {slideshowProducts.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`rounded-full transition ${
                        i === currentSlide 
                          ? "w-3 h-3 bg-emerald-700" 
                          : "w-2 h-2 bg-emerald-300 hover:bg-emerald-400"
                      }`}
                      aria-label={`Go to slide ${i + 1}`}
                      title={`Slide ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* "You might need" Grid Section */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-emerald-900">You might need</h2>
                <button
                  onClick={() => document.querySelector('[href="/products"]')?.click()}
                  className="text-emerald-600 hover:text-emerald-800 font-semibold text-sm"
                >
                  See more →
                </button>
              </div>

              {/* Product Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {allProducts.slice(0, 12).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col cursor-pointer"
                    onClick={() => openProductDetails(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openProductDetails(p);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Image */}
                    <div className="w-full h-32 bg-emerald-50 flex items-center justify-center overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-gray-400">No image</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-3 flex flex-col flex-1">
                      <div className="font-semibold text-sm text-gray-800 line-clamp-2">{p.name}</div>
                      <div className="mt-auto pt-3 space-y-2">
                        <div className="text-xs text-amber-700">
                          {(ratingsByProduct[p.id]?.count || 0) > 0
                            ? `${ratingsByProduct[p.id].avg.toFixed(1)} ★ (${ratingsByProduct[p.id].count})`
                            : "No ratings"}
                        </div>
                        <div className="font-bold text-lg text-emerald-700">₱{Number(p.price || 0).toFixed(2)}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const { lengthOptions, colorOptions } = getProductOptions(p);
                              if (lengthOptions.length || colorOptions.length) {
                                openProductDetails(p);
                                return;
                              }
                              addToCart(p);
                            }}
                            disabled={Number(p.stock || 0) === 0}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 inline-flex items-center justify-center gap-1"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 4h2l2 10h10l2-7H6" />
                              <circle cx="9" cy="19" r="1.5" />
                              <circle cx="17" cy="19" r="1.5" />
                            </svg>
                            Cart
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const { lengthOptions, colorOptions } = getProductOptions(p);
                              if (lengthOptions.length || colorOptions.length) {
                                openProductDetails(p);
                                return;
                              }
                              openBuyNow(p);
                            }}
                            disabled={Number(p.stock || 0) === 0}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                          >
                            Buy
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Toast Notification */}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 bg-emerald-700 text-white px-6 py-3 rounded-lg shadow-lg z-40">
          {toast.message}
        </div>
      )}

      {/* Buy Now Modal */}
      {buyNowOpen && buyNowProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-emerald-200 bg-emerald-50 flex items-center justify-between">
              <div className="text-lg font-semibold text-emerald-900">Order Summary</div>
              <button
                onClick={() => setBuyNowOpen(false)}
                className="text-2xl text-emerald-700 hover:text-emerald-900"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              {/* Product Image */}
              <div className="w-full h-48 bg-emerald-50 rounded-lg overflow-hidden flex items-center justify-center">
                {buyNowProduct.image_url ? (
                  <img
                    src={buyNowProduct.image_url}
                    alt={buyNowProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400">No image</span>
                )}
              </div>

              {/* Product Info */}
              <div>
                <div className="font-bold text-lg text-emerald-900">{buyNowProduct.name}</div>
                <div className="text-sm text-emerald-700 mt-1">{buyNowProduct.description || "—"}</div>
              </div>

              {/* Quantity Selector */}
              <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50">
                <label className="text-xs text-emerald-700 font-medium">Quantity</label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={() => setBuyNowQty(Math.max(1, buyNowQty - 1))}
                    className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={Number(buyNowProduct.stock || 1)}
                    value={buyNowQty}
                    onChange={(e) => setBuyNowQty(Math.max(1, Number(e.target.value)))}
                    className="w-16 border border-emerald-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => setBuyNowQty(Math.min(Number(buyNowProduct.stock || 1), buyNowQty + 1))}
                    className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Price Summary */}
              <div className="border-t border-emerald-200 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-700">Subtotal</span>
                  <span className="font-semibold text-emerald-900">₱{(Number(buyNowProduct.price || 0) * buyNowQty).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-700">Shipping</span>
                  <span className="text-emerald-700">Calculated at checkout</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-emerald-200 pt-2">
                  <span className="text-emerald-900">Total</span>
                  <span className="text-emerald-700">₱{(Number(buyNowProduct.price || 0) * buyNowQty).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-emerald-200 bg-emerald-50 flex gap-3">
              <button
                onClick={() => {
                  if (buyNowProduct) {
                    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
                    const optionsKey = makeOptionsKey(buyNowOptions);
                    const idx = cart.findIndex((x) => x.product_id === buyNowProduct.id && (x.options_key || "") === optionsKey);
                    if (idx >= 0) {
                      cart[idx].qty += Number(buyNowQty);
                    } else {
                      cart.push({
                        product_id: buyNowProduct.id,
                        name: buyNowProduct.name,
                        price: Number(buyNowProduct.price || 0),
                        qty: Number(buyNowQty),
                        image_url: buyNowProduct.image_url || null,
                        options: normalizeOptions(buyNowOptions),
                        options_key: optionsKey,
                      });
                    }
                    localStorage.setItem("cart", JSON.stringify(cart));
                    setToast({ message: `Added to cart`, visible: true });
                    setTimeout(() => setToast({ message: "", visible: false }), 2000);
                  }
                  setBuyNowOpen(false);
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 inline-flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h2l2 10h10l2-7H6" />
                  <circle cx="9" cy="19" r="1.5" />
                  <circle cx="17" cy="19" r="1.5" />
                </svg>
                Cart
              </button>
              <button
                onClick={confirmBuyNow}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickCheckoutModal
        open={quickCheckoutOpen}
        item={quickCheckoutItem}
        onClose={() => {
          setQuickCheckoutOpen(false);
          setQuickCheckoutItem(null);
        }}
        onOrdered={() => {
          if (!quickCheckoutItem?.product_id) return;
          const cart = JSON.parse(localStorage.getItem("cart") || "[]");
          const next = cart.filter(
            (x) =>
              !(
                Number(x.product_id) === Number(quickCheckoutItem.product_id) &&
                (x.options_key || "") === (quickCheckoutItem.options_key || "")
              )
          );
          localStorage.setItem("cart", JSON.stringify(next));
        }}
      />

      {detailsOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-emerald-200 bg-emerald-50 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-emerald-900">{selectedProduct.name}</div>
              </div>
              <button
                onClick={() => setDetailsOpen(false)}
                className="text-2xl text-emerald-700 hover:text-emerald-900"
              >
                ×
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="w-full h-48 bg-emerald-50 rounded-lg overflow-hidden flex items-center justify-center">
                  {selectedProduct.image_url ? (
                    <img
                      src={selectedProduct.image_url}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400">No image</span>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="text-emerald-700">{selectedProduct.category || "—"}</div>
                  <div className="text-gray-700">{selectedProduct.description || "No description."}</div>

                  {(selectedOptions.lengthOptions.length > 0 || selectedOptions.colorOptions.length > 0) && (
                    <div className="space-y-2">
                      {selectedOptions.lengthOptions.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-emerald-700">Length</label>
                          <select
                            value={selectedLength}
                            onChange={(e) => {
                              setSelectedLength(e.target.value);
                              setOptionError("");
                            }}
                            className="mt-1 w-full border border-emerald-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">Select length</option>
                            {selectedOptions.lengthOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {selectedOptions.colorOptions.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-emerald-700">Color</label>
                          <select
                            value={selectedColor}
                            onChange={(e) => {
                              setSelectedColor(e.target.value);
                              setOptionError("");
                            }}
                            className="mt-1 w-full border border-emerald-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">Select color</option>
                            {selectedOptions.colorOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {optionError && (
                        <div className="text-xs text-red-600 font-medium">{optionError}</div>
                      )}
                    </div>
                  )}

                  <div className="text-sm text-amber-700">
                    {selectedReviewStats.count > 0
                      ? `${selectedReviewStats.avg.toFixed(1)} ★ (${selectedReviewStats.count} review${selectedReviewStats.count > 1 ? "s" : ""})`
                      : "No ratings yet"}
                  </div>
                  <div className="font-bold text-2xl text-emerald-700">
                    ₱{Number(selectedProduct.price || 0).toFixed(2)}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedOptions.lengthOptions.length > 0 && !selectedLength) {
                          setOptionError("Please select a length option.");
                          return;
                        }
                        if (selectedOptions.colorOptions.length > 0 && !selectedColor) {
                          setOptionError("Please select a color option.");
                          return;
                        }
                        addToCart(selectedProduct, { length: selectedLength, color: selectedColor });
                        setDetailsOpen(false);
                      }}
                      disabled={Number(selectedProduct.stock || 0) === 0}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 4h2l2 10h10l2-7H6" />
                        <circle cx="9" cy="19" r="1.5" />
                        <circle cx="17" cy="19" r="1.5" />
                      </svg>
                      Add to cart
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedOptions.lengthOptions.length > 0 && !selectedLength) {
                          setOptionError("Please select a length option.");
                          return;
                        }
                        if (selectedOptions.colorOptions.length > 0 && !selectedColor) {
                          setOptionError("Please select a color option.");
                          return;
                        }
                        setDetailsOpen(false);
                        openBuyNow(selectedProduct, { length: selectedLength, color: selectedColor });
                      }}
                      disabled={Number(selectedProduct.stock || 0) === 0}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Buy
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-semibold text-emerald-900">Customer comments</div>

                {reviewsError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {reviewsError}
                  </div>
                )}

                {reviewsLoading ? (
                  <div className="text-sm text-emerald-700">Loading comments...</div>
                ) : reviews.length === 0 ? (
                  <div className="text-sm text-gray-500">No comments yet.</div>
                ) : (
                  reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-800">{r.profile_name}</div>
                        <div className="text-sm text-amber-600">{Number(r.rating || 0)} ★</div>
                      </div>
                      <div className="mt-1 text-sm text-gray-700">{r.comment}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
