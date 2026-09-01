/**
 * seed.js — Generates 500 products across 5 categories
 * Run: node seed.js  (generates data/products.json and data/categories.json)
 */

const fs = require("fs");
const path = require("path");

const categories = [
  { id: 1, name: "Electronics",   description: "Gadgets, computers, phones and accessories", iconEmoji: "💻" },
  { id: 2, name: "Books",         description: "Fiction, non-fiction, textbooks and more",   iconEmoji: "📚" },
  { id: 3, name: "Clothing",      description: "Men, women and kids fashion",                 iconEmoji: "👗" },
  { id: 4, name: "Home & Garden", description: "Furniture, decor and garden tools",           iconEmoji: "🏠" },
  { id: 5, name: "Sports",        description: "Equipment, apparel and outdoor gear",          iconEmoji: "⚽" },
];

const productTemplates = {
  1: ["Laptop Pro 15\"", "Wireless Earbuds", "4K Monitor", "Mechanical Keyboard", "Gaming Mouse",
      "USB-C Hub", "Webcam HD", "Smart Watch", "Tablet 10\"", "Noise Cancelling Headphones",
      "SSD 1TB", "Portable Charger", "Bluetooth Speaker", "LED Desk Lamp", "Action Camera"],
  2: ["Clean Code", "The Pragmatic Programmer", "Design Patterns", "Atomic Habits", "Deep Work",
      "The Alchemist", "Sapiens", "Thinking Fast and Slow", "Rich Dad Poor Dad", "1984",
      "Dune", "The Art of War", "Zero to One", "Ikigai", "Brief History of Time"],
  3: ["Running Jacket", "Denim Jeans", "Cotton T-Shirt", "Formal Blazer", "Summer Dress",
      "Hoodie XL", "Sports Leggings", "Linen Shirt", "Woolen Sweater", "Cargo Pants",
      "Polo Shirt", "Leather Belt", "Winter Coat", "Yoga Pants", "Casual Sneakers"],
  4: ["Standing Desk", "Ergonomic Chair", "Bookshelf", "Floor Lamp", "Wall Art Print",
      "Coffee Table", "Indoor Plant Pot", "Kitchen Organizer", "Throw Pillow", "Candle Set",
      "Storage Box", "Curtain Set", "Door Mat", "Shower Caddy", "Mirror Frame"],
  5: ["Yoga Mat", "Resistance Bands", "Dumbbell Set", "Jump Rope", "Foam Roller",
      "Pull-Up Bar", "Running Shoes", "Cycling Helmet", "Football", "Tennis Racket",
      "Swimming Goggles", "Protein Shaker", "Gym Gloves", "Treadmill Desk", "Badminton Set"],
};

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

const products = [];
let id = 1;

for (let catId = 1; catId <= 5; catId++) {
  const templates = productTemplates[catId];
  for (let i = 0; i < 100; i++) {
    const baseName = templates[i % templates.length];
    const variant = i < templates.length ? "" : ` v${Math.floor(i / templates.length) + 1}`;
    const daysAgo = randomInt(0, 730);
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

    let priceMin, priceMax;
    if (catId === 1) { priceMin = 29.99;  priceMax = 2499.99; }
    else if (catId === 2) { priceMin = 5.99; priceMax = 89.99; }
    else if (catId === 3) { priceMin = 9.99; priceMax = 299.99; }
    else if (catId === 4) { priceMin = 14.99; priceMax = 999.99; }
    else { priceMin = 7.99; priceMax = 499.99; }

    products.push({
      id,
      name: baseName + variant,
      description: `High-quality ${baseName.toLowerCase()} from our ${categories[catId - 1].name} collection. Perfect for everyday use.`,
      price: parseFloat(randomBetween(priceMin, priceMax).toFixed(2)),
      stock: randomInt(0, 500),
      rating: parseFloat(randomBetween(2.5, 5.0).toFixed(1)),
      reviewCount: randomInt(0, 5000),
      categoryId: catId,
      categoryName: categories[catId - 1].name,
      categoryEmoji: categories[catId - 1].iconEmoji,
      createdAt,
    });
    id++;
  }
}

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

fs.writeFileSync(path.join(dataDir, "products.json"), JSON.stringify(products, null, 2));
fs.writeFileSync(path.join(dataDir, "categories.json"), JSON.stringify(categories, null, 2));

console.log(`✅ Seeded ${products.length} products across ${categories.length} categories`);
console.log(`📁 Written to data/products.json and data/categories.json`);
