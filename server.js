/**
 * server.js — Express REST API
 * Demonstrates: Pagination, Sorting, Caching, N+1 simulation, Native-style Aggregation
 */

const express = require("express");
const cors = require("cors");
const NodeCache = require("node-cache");
const fs = require("fs");
const path = require("path");

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const app = express();
const PORT = 3001;

// In-memory cache (TTL = 300 seconds = 5 minutes)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── Load Data ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
let products = [];
let categories = [];

function loadData() {
  try {
    products = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "products.json"), "utf8"));
    categories = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "categories.json"), "utf8"));
    console.log(`✅ Loaded ${products.length} products, ${categories.length} categories`);
  } catch (e) {
    console.error("❌ Data not found. Run: node seed.js");
    process.exit(1);
  }
}

// ─── Timing Middleware ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.startTime = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - req.startTime;
    console.log(`[${req.method}] ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ─── Helper: Paginate & Sort ──────────────────────────────────────────────────
function paginateAndSort(data, { page = 0, size = 10, sortBy = "id", direction = "asc" }) {
  // 1. Sort
  const dir = direction.toLowerCase() === "desc" ? -1 : 1;
  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;
    if (typeof aVal === "string") return dir * aVal.localeCompare(bVal);
    return dir * (aVal - bVal);
  });

  // 2. Paginate
  const pageNum = Math.max(0, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(size)));
  const totalElements = sorted.length;
  const totalPages = Math.ceil(totalElements / pageSize);
  const start = pageNum * pageSize;
  const content = sorted.slice(start, start + pageSize);

  return {
    content,
    page: {
      number: pageNum,
      size: pageSize,
      totalElements,
      totalPages,
      first: pageNum === 0,
      last: pageNum >= totalPages - 1,
    },
    sort: { sortBy, direction: direction.toLowerCase() },
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/products
 * Paginated + Sortable product list
 * Query params: page, size, sortBy, direction, categoryId, search
 */
app.get("/api/products", (req, res) => {
  const { page = 0, size = 10, sortBy = "id", direction = "asc", categoryId, search } = req.query;

  let filtered = [...products];

  // Filter by category
  if (categoryId && categoryId !== "all") {
    filtered = filtered.filter((p) => p.categoryId === parseInt(categoryId));
  }

  // Search filter
  if (search && search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  }

  const result = paginateAndSort(filtered, { page, size, sortBy, direction });
  res.json({ ...result, queryType: "PAGINATED_SORT", timestamp: Date.now() });
});

/**
 * GET /api/products/:id
 * Single product by ID
 */
app.get("/api/products/:id", (req, res) => {
  const product = products.find((p) => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

/**
 * GET /api/products/optimized/list
 * Simulates JOIN FETCH — returns products with category data in one pass (no N+1).
 * Adds artificial delay difference to illustrate optimization benefit.
 */
app.get("/api/products/optimized/list", (req, res) => {
  const { page = 0, size = 10, sortBy = "id", direction = "asc" } = req.query;

  // Simulate optimized JOIN FETCH — single pass, data already joined
  const startOpt = Date.now();
  const result = paginateAndSort(products, { page, size, sortBy, direction });
  const optimizedTime = Date.now() - startOpt;

  res.json({
    ...result,
    queryType: "JOIN_FETCH_OPTIMIZED",
    executionMs: optimizedTime + Math.floor(Math.random() * 5) + 2, // realistic fast time
    queryCount: 1,
    explanation: "Single query with JOIN FETCH — category data fetched in one DB round trip",
    timestamp: Date.now(),
  });
});

/**
 * GET /api/products/n1/list
 * Simulates N+1 problem — products fetched, then category fetched per product.
 * Artificial delay simulates extra DB round trips.
 */
app.get("/api/products/n1/list", async (req, res) => {
  const { page = 0, size = 10, sortBy = "id", direction = "asc" } = req.query;

  const { content, page: pageInfo } = paginateAndSort(products, { page, size, sortBy, direction });

  // Simulate N+1: 1 query for products + N queries for categories
  const baseDelay = 10;
  const perProductDelay = 3;
  const simulatedMs = baseDelay + content.length * perProductDelay + Math.floor(Math.random() * 20);

  // Artificial sleep to simulate N+1 cost
  await new Promise((r) => setTimeout(r, Math.min(simulatedMs, 120)));

  res.json({
    content,
    page: pageInfo,
    queryType: "N_PLUS_1_PROBLEM",
    executionMs: simulatedMs,
    queryCount: 1 + content.length, // 1 main + N category fetches
    explanation: `N+1 Problem: 1 product query + ${content.length} separate category queries = ${1 + content.length} total DB calls`,
    timestamp: Date.now(),
  });
});

/**
 * GET /api/products/cached/list
 * Demonstrates @Cacheable — first call hits "DB", subsequent calls are instant from cache.
 */
app.get("/api/products/cached/list", (req, res) => {
  const { page = 0, size = 10, sortBy = "id", direction = "asc" } = req.query;
  const cacheKey = `products_p${page}_s${size}_sort${sortBy}_${direction}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({
      ...cached,
      cacheHit: true,
      executionMs: Math.floor(Math.random() * 2) + 1,
      cacheInfo: "✅ Cache HIT — data served from Ehcache memory (no DB query)",
      queryType: "CACHED",
      timestamp: Date.now(),
    });
  }

  // Simulate DB query delay on cache miss
  const dbMs = Math.floor(Math.random() * 30) + 20;
  const result = paginateAndSort(products, { page, size, sortBy, direction });

  // Store in cache
  cache.set(cacheKey, result);

  res.json({
    ...result,
    cacheHit: false,
    executionMs: dbMs,
    cacheInfo: "❌ Cache MISS — queried database and stored result in cache",
    queryType: "CACHED_MISS",
    timestamp: Date.now(),
  });
});

/**
 * GET /api/products/stats/native
 * Simulates native SQL aggregation query — stats per category
 */
app.get("/api/products/stats/native", (req, res) => {
  const cacheKey = "product_stats";
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({ ...cached, cacheHit: true, timestamp: Date.now() });
  }

  // Aggregate statistics (simulates: SELECT categoryId, COUNT(*), AVG(price), AVG(rating)... GROUP BY categoryId)
  const stats = categories.map((cat) => {
    const catProducts = products.filter((p) => p.categoryId === cat.id);
    const prices = catProducts.map((p) => p.price);
    const ratings = catProducts.map((p) => p.rating);
    const stocks = catProducts.map((p) => p.stock);

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryEmoji: cat.iconEmoji,
      totalProducts: catProducts.length,
      avgPrice: parseFloat((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)),
      minPrice: parseFloat(Math.min(...prices).toFixed(2)),
      maxPrice: parseFloat(Math.max(...prices).toFixed(2)),
      avgRating: parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
      totalStock: stocks.reduce((a, b) => a + b, 0),
      inStockCount: catProducts.filter((p) => p.stock > 0).length,
    };
  });

  const overall = {
    totalProducts: products.length,
    avgPrice: parseFloat((products.reduce((s, p) => s + p.price, 0) / products.length).toFixed(2)),
    avgRating: parseFloat((products.reduce((s, p) => s + p.rating, 0) / products.length).toFixed(2)),
    totalInStock: products.filter((p) => p.stock > 0).length,
    totalReviews: products.reduce((s, p) => s + p.reviewCount, 0),
  };

  const result = {
    byCategory: stats,
    overall,
    sqlQuery: "SELECT c.name, COUNT(p.id), AVG(p.price), AVG(p.rating), SUM(p.stock) FROM products p JOIN categories c ON p.category_id = c.id GROUP BY c.id, c.name ORDER BY COUNT(p.id) DESC",
    queryType: "NATIVE_SQL_AGGREGATION",
    cacheHit: false,
  };

  cache.set(cacheKey, result, 120); // 2 min TTL for stats
  res.json({ ...result, timestamp: Date.now() });
});

/**
 * GET /api/categories
 * All categories (cached)
 */
app.get("/api/categories", (req, res) => {
  const cacheKey = "all_categories";
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ data: cached, cacheHit: true });

  const withCounts = categories.map((cat) => ({
    ...cat,
    productCount: products.filter((p) => p.categoryId === cat.id).length,
  }));

  cache.set(cacheKey, withCounts, 3600); // 1 hour TTL
  res.json({ data: withCounts, cacheHit: false });
});

/**
 * POST /api/products
 * Add a new product (also demonstrates cache eviction)
 */
app.post("/api/products", (req, res) => {
  const { name, price, stock, rating, reviewCount, categoryId, description } = req.body;

  if (!name || !price || !categoryId) {
    return res.status(400).json({ error: "name, price, categoryId are required" });
  }

  const cat = categories.find((c) => c.id === parseInt(categoryId));
  if (!cat) return res.status(400).json({ error: "Invalid categoryId" });

  const newProduct = {
    id: products.length + 1,
    name,
    description: description || "",
    price: parseFloat(price),
    stock: parseInt(stock) || 0,
    rating: parseFloat(rating) || 4.0,
    reviewCount: parseInt(reviewCount) || 0,
    categoryId: cat.id,
    categoryName: cat.name,
    categoryEmoji: cat.iconEmoji,
    createdAt: new Date().toISOString(),
  };

  products.push(newProduct);

  // Evict all product-related caches (simulates @CacheEvict)
  const evicted = cache.keys().filter((k) => k.startsWith("products_"));
  evicted.forEach((k) => cache.del(k));
  cache.del("product_stats");

  res.status(201).json({
    product: newProduct,
    cacheEvicted: evicted.length,
    message: `Product created. Evicted ${evicted.length} cache entries (@CacheEvict).`,
  });
});

/**
 * GET /api/cache/status
 * Shows cache statistics
 */
app.get("/api/cache/status", (req, res) => {
  const stats = cache.getStats();
  const keys = cache.keys();
  res.json({
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits + stats.misses > 0
      ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) + "%"
      : "0%",
    keyCount: keys.length,
    keys,
    ttlSeconds: 300,
  });
});

/**
 * DELETE /api/cache/flush
 * Flush all caches (for demo reset)
 */
app.delete("/api/cache/flush", (req, res) => {
  cache.flushAll();
  res.json({ message: "All caches flushed successfully" });
});

/**
 * GET /health
 */
app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    productCount: products.length,
    categoryCount: categories.length,
    cacheKeys: cache.keys().length,
    uptime: Math.floor(process.uptime()) + "s",
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
loadData();
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /api/products           → Paginated + Sortable`);
  console.log(`   GET  /api/products/optimized/list  → JOIN FETCH simulation`);
  console.log(`   GET  /api/products/n1/list   → N+1 Problem simulation`);
  console.log(`   GET  /api/products/cached/list     → Ehcache demo`);
  console.log(`   GET  /api/products/stats/native    → Native SQL aggregation`);
  console.log(`   GET  /api/categories         → Categories with product counts`);
  console.log(`   POST /api/products           → Add product + cache eviction`);
  console.log(`   GET  /api/cache/status       → Cache hit/miss stats`);
  console.log(`   GET  /health                 → Health check`);
});
