// Adds GamePro Kigali's own products to the marketplace, listed by the admin account's store profile.
//
//   STORE_PHONE="0788 000 000" [STORE_WHATSAPP="0788 000 000"] npm run seed:catalog
//
// - Photos from public/images/market are used where we have them; the rest are downloaded from
//   Wikimedia Commons (freely licensed) and stored like any uploaded photo.
// - New items: current online retail price converted to RWF. Used items: average online used price.
// - Safe to re-run: products that already exist (same title, same store) are skipped.
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { prisma } from "../server/lib/db.js";
import { saveImage } from "../server/lib/uploads.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.join(__dirname, "..", "public", "images", "market");
const COMMONS = "https://thumb.wikimedia.org/wikipedia/commons/thumb";
const LOCATION = "Kabeza, Kicukiro, Kigali";
const USD_RWF = 1475; // late Oct 2026 mid-market rate

const rwf = (usd) => Math.round((usd * USD_RWF) / 5000) * 5000;
const credit = (author, license) => `\n\nPhoto: ${author}, ${license}, via Wikimedia Commons.`;

const PRODUCTS = [
  // ── New ───────────────────────────────────────────────
  {
    title: "PlayStation 5 Pro (2TB)",
    categoryId: "cat_ps5",
    brand: "Sony",
    condition: "NEW",
    price: rwf(899.99),
    image: { file: "PS5.jpg" },
    description:
      "Brand new PlayStation 5 Pro with 2TB SSD. Sony's most powerful console: sharper 4K graphics, higher frame rates and PSSR upscaling. Comes with a DualSense wireless controller and all cables.",
    conditionNotes: "Sealed in box with manufacturer warranty.",
    specs: [["Storage", "2TB SSD"], ["Resolution", "Up to 4K, 8K output"], ["Included", "DualSense controller, HDMI & power cables"], ["Disc drive", "Sold separately"]]
  },
  {
    title: "Xbox Series X Digital Edition (1TB, Robot White)",
    categoryId: "cat_xbox_x",
    brand: "Microsoft",
    condition: "NEW",
    price: rwf(749.99),
    image: { file: "xbox.png" },
    description:
      "Brand new Xbox Series X Digital Edition in Robot White. True 4K gaming at up to 120 FPS, Quick Resume and full Game Pass support. Digital-only (no disc drive).",
    conditionNotes: "Sealed in box with manufacturer warranty.",
    specs: [["Storage", "1TB SSD"], ["Resolution", "4K at up to 120 FPS"], ["Disc drive", "No (digital only)"], ["Included", "Xbox Wireless Controller, HDMI & power cables"]]
  },
  {
    title: "Xbox Series S (512GB)",
    categoryId: "cat_xbox_s",
    brand: "Microsoft",
    condition: "NEW",
    price: rwf(499.99),
    image: { url: `${COMMONS}/5/54/Xbox_Series_S_with_controller.jpg/1280px-Xbox_Series_S_with_controller.jpg`, credit: credit("AsmodeanUnderscore", "CC BY-SA 4.0") },
    description: "Brand new Xbox Series S, the compact all-digital Xbox. Next-gen speed, up to 120 FPS and Game Pass ready.",
    conditionNotes: "Sealed in box with manufacturer warranty.",
    specs: [["Storage", "512GB SSD"], ["Resolution", "1440p, up to 120 FPS"], ["Disc drive", "No (digital only)"], ["Included", "Xbox Wireless Controller, HDMI & power cables"]]
  },
  {
    title: "Nintendo Switch 2",
    categoryId: "cat_switch",
    brand: "Nintendo",
    condition: "NEW",
    price: rwf(499.99),
    image: { url: `${COMMONS}/4/4e/Nintendo_Switch_2_in_Docking_Console.jpg/1280px-Nintendo_Switch_2_in_Docking_Console.jpg`, credit: credit("Crisco 1492", "CC BY-SA 4.0") },
    description: "Brand new Nintendo Switch 2. Play on your TV or take it with you: bigger 1080p screen, 4K when docked, and new Joy-Con 2 controllers.",
    conditionNotes: "Sealed in box with manufacturer warranty.",
    specs: [["Screen", '7.9" 1080p, 120Hz'], ["TV output", "Up to 4K"], ["Storage", "256GB"], ["Included", "Joy-Con 2 (L/R), dock, grip, HDMI & power"]]
  },
  {
    title: "DualSense Wireless Controller (PS5)",
    categoryId: "cat_ctrl_ps5",
    brand: "Sony",
    condition: "NEW",
    price: rwf(74.99),
    image: { file: "controller.webp" },
    description: "Brand new official PS5 DualSense controller with haptic feedback, adaptive triggers and built-in microphone. Also works with PC and mobile.",
    conditionNotes: "New in box.",
    specs: [["Compatibility", "PS5, PC, Android, iOS"], ["Connection", "Bluetooth / USB-C"], ["Features", "Haptic feedback, adaptive triggers, mic"]]
  },
  {
    title: "DualShock 4 Wireless Controller (PS4, Black)",
    categoryId: "cat_ctrl_ps4",
    brand: "Sony",
    condition: "NEW",
    price: rwf(59.99),
    image: { file: "ps4 controllers.jpg" },
    description: "Brand new official DualShock 4 controller for PlayStation 4 in Jet Black, with touch pad, light bar and built-in speaker.",
    conditionNotes: "New in box.",
    specs: [["Compatibility", "PS4, PC"], ["Connection", "Bluetooth / Micro-USB"], ["Color", "Jet Black"]]
  },
  {
    title: "Xbox Wireless Controller (Carbon Black)",
    categoryId: "cat_ctrl_xbox",
    brand: "Microsoft",
    condition: "NEW",
    price: rwf(64.99),
    image: { url: `${COMMONS}/c/cb/Xbox_Series_Controller_Carbon_Black.jpg/1280px-Xbox_Series_Controller_Carbon_Black.jpg`, credit: credit("uKER", "CC BY-SA 4.0") },
    description: "Brand new official Xbox Wireless Controller in Carbon Black, with textured grips, hybrid D-pad and Share button.",
    conditionNotes: "New in box.",
    specs: [["Compatibility", "Xbox Series X|S, Xbox One, PC, mobile"], ["Connection", "Xbox Wireless, Bluetooth, USB-C"], ["Power", "2× AA batteries"]]
  },
  {
    title: "PlayStation Pulse Elite Wireless Headset",
    categoryId: "cat_headsets",
    brand: "Sony",
    condition: "NEW",
    price: rwf(149.99),
    image: { file: "headset.webp" },
    description: "Brand new PlayStation Pulse Elite headset with planar magnetic drivers, retractable AI noise-rejecting mic and lossless PlayStation Link audio.",
    conditionNotes: "New in box.",
    specs: [["Compatibility", "PS5, PS Portal, PC, Mac, mobile"], ["Connection", "PlayStation Link, Bluetooth"], ["Battery", "Up to 30 hours"]]
  },
  {
    title: "Logitech G29 Driving Force Racing Wheel + Pedals",
    categoryId: "cat_wheels",
    brand: "Logitech",
    condition: "NEW",
    price: rwf(251),
    image: { url: `${COMMONS}/e/ed/Logitech_G29_steering_wheel.jpg/1280px-Logitech_G29_steering_wheel.jpg`, credit: credit("Antoineets", "CC BY-SA 4.0") },
    description: "Brand new Logitech G29 racing wheel with dual-motor force feedback, leather-wrapped rim and 3-pedal set. Perfect for Gran Turismo, F1 and Forza Horizon.",
    conditionNotes: "New in box.",
    specs: [["Compatibility", "PS5, PS4, PC"], ["Rotation", "900°"], ["Included", "Wheel, 3 pedals (gas, brake, clutch)"], ["Shifter", "Sold separately"]]
  },
  {
    title: "Racing-Style Gaming Chair (Black/Red)",
    categoryId: "cat_chairs",
    brand: null,
    condition: "NEW",
    price: rwf(199.99),
    image: { url: `${COMMONS}/b/b2/Gaming_chair.jpg/1280px-Gaming_chair.jpg`, credit: credit("Ndurliat", "CC BY-SA 4.0") },
    description: "Brand new ergonomic racing-style gaming chair with adjustable armrests, lumbar and head pillows, and reclining backrest.",
    conditionNotes: "New, delivered assembled in Kigali.",
    specs: [["Material", "PU leather"], ["Recline", "90°–155°"], ["Max load", "150 kg"], ["Color", "Black / red"]]
  },

  // ── Used ──────────────────────────────────────────────
  {
    title: "PlayStation 4 Slim (1TB)",
    categoryId: "cat_ps4",
    brand: "Sony",
    condition: "USED",
    price: rwf(160),
    image: { file: "PS4.jpg" },
    description: "Pre-owned PlayStation 4 Slim, tested and working, with one DualShock 4 controller, HDMI and power cables.",
    conditionNotes: "Used, fully tested by GamePro. Light signs of use on the case; no faults.",
    specs: [["Storage", "1TB"], ["Included", "DualShock 4 controller, HDMI & power cables"], ["Tested", "Yes, by GamePro"]]
  },
  {
    title: "Xbox One S (1TB)",
    categoryId: "cat_xbox_one",
    brand: "Microsoft",
    condition: "USED",
    price: rwf(120),
    image: { url: `${COMMONS}/6/63/Microsoft-Xbox-One-S-Console-FL.jpg/1280px-Microsoft-Xbox-One-S-Console-FL.jpg`, credit: credit("Evan-Amos", "public domain") },
    description: "Pre-owned Xbox One S with 4K Blu-ray drive, tested and working, with controller and cables.",
    conditionNotes: "Used, fully tested by GamePro. Minor surface marks; no faults.",
    specs: [["Storage", "1TB"], ["Disc drive", "4K Ultra HD Blu-ray"], ["Included", "Xbox controller, HDMI & power cables"]]
  },
  {
    title: "PlayStation 3 Slim",
    categoryId: "cat_ps3",
    brand: "Sony",
    condition: "USED",
    price: rwf(100),
    image: { url: `${COMMONS}/3/38/Sony-PlayStation-PS3-Slim-Console-FR.jpg/1280px-Sony-PlayStation-PS3-Slim-Console-FR.jpg`, credit: credit("Evan-Amos", "public domain") },
    description: "Pre-owned PlayStation 3 Slim, tested and working: a great budget console for classic PS3 games and Blu-ray movies.",
    conditionNotes: "Used, fully tested by GamePro. Visible wear on the case; no faults.",
    specs: [["Storage", "120–320GB (varies)"], ["Disc drive", "Blu-ray"], ["Included", "DualShock 3 controller, HDMI & power cables"]]
  }
];

async function loadImage(img) {
  if (img.file) return fs.readFileSync(path.join(IMG_DIR, img.file));
  // Wikimedia rate-limits bursts: retry politely
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(img.url, { headers: { "User-Agent": "GameProCatalog/1.0 (product images)" } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 || attempt >= 5) throw new Error(`Download failed (${res.status}): ${img.url}`);
    await new Promise((r) => setTimeout(r, attempt * 4000));
  }
}

async function main() {
  const phone = (process.env.STORE_PHONE || "").trim();
  if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw new Error('Set STORE_PHONE, e.g. STORE_PHONE="0788 000 000"');
  const email = (process.env.ADMIN_EMAIL || "kigaligamepro@gmail.com").toLowerCase();
  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) throw new Error(`Admin account ${email} not found. Run npm run seed first.`);

  const seller = await prisma.sellerProfile.upsert({
    where: { userId: admin.id },
    update: { phone, whatsapp: process.env.STORE_WHATSAPP || phone },
    create: {
      userId: admin.id,
      displayName: "GamePro Kigali",
      type: "STORE",
      phone,
      whatsapp: process.env.STORE_WHATSAPP || phone,
      location: LOCATION,
      bio: "Kigali's gaming center: consoles, controllers and accessories, all checked by our team. Visit us in Kabeza, Kicukiro."
    }
  });

  let added = 0;
  for (const p of PRODUCTS) {
    const exists = await prisma.product.findFirst({ where: { sellerId: seller.id, title: p.title }, select: { id: true } });
    if (exists) {
      console.log(`skip   ${p.title} (already listed)`);
      continue;
    }
    const upload = await saveImage(admin.id, await loadImage(p.image));
    const now = new Date();
    await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: p.categoryId,
        title: p.title,
        description: p.description + (p.image.credit || ""),
        price: p.price,
        currency: "RWF",
        condition: p.condition,
        conditionNotes: p.conditionNotes,
        brand: p.brand,
        location: LOCATION,
        contactPhone: phone,
        contactEmail: email,
        specs: p.specs.map(([label, value]) => ({ label, value })),
        quantity: 1,
        status: "ACTIVE",
        publishedAt: now,
        reviewedById: admin.id,
        reviewedAt: now,
        images: { create: [{ uploadId: upload.id, position: 0 }] }
      }
    });
    added++;
    console.log(`added  ${p.title}  ${p.condition}  ${p.price.toLocaleString("en-US")} RWF`);
  }
  console.log(`\nDone: ${added} added, ${PRODUCTS.length - added} skipped.`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
