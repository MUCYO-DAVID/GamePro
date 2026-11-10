-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('INDIVIDUAL', 'STORE');

-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "ProductAvailability" AS ENUM ('AVAILABLE', 'RESERVED', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'DECLINED', 'SOLD', 'INACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAYMENT_PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'DECLINED', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('FLUTTERWAVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION', 'CLICK');

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'fa-gamepad',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" "SellerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "location" TEXT NOT NULL,
    "bio" TEXT,
    "status" "SellerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "condition" "ProductCondition" NOT NULL,
    "conditionNotes" TEXT,
    "brand" TEXT,
    "location" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "specs" JSONB NOT NULL DEFAULT '[]',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "availability" "ProductAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "declineReason" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "ProductInquiry" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReport" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductView" (
    "productId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "ProductView_pkey" PRIMARY KEY ("productId","visitorHash","day")
);

-- CreateTable
CREATE TABLE "AdPlacement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxActive" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPackage" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationDays" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "placementId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL DEFAULT 'Learn More',
    "linkUrl" TEXT,
    "logoUploadId" TEXT,
    "bannerUploadId" TEXT,
    "preferredStartDate" TIMESTAMP(3),
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "durationDays" INTEGER NOT NULL,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" "AdStatus" NOT NULL DEFAULT 'DRAFT',
    "declineReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "expiryWarnedAt" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPayment" (
    "id" TEXT NOT NULL,
    "adId" TEXT,
    "userId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "txRef" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "payerReference" TEXT,
    "failureReason" TEXT,
    "providerResponse" JSONB,
    "paidAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdEvent" (
    "adId" TEXT NOT NULL,
    "type" "AdEventType" NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("adId","type","visitorHash","day")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upload_ownerId_createdAt_idx" ON "Upload"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_sortOrder_idx" ON "Category"("parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");

-- CreateIndex
CREATE INDEX "SellerProfile_status_idx" ON "SellerProfile"("status");

-- CreateIndex
CREATE INDEX "Product_status_categoryId_idx" ON "Product"("status", "categoryId");

-- CreateIndex
CREATE INDEX "Product_status_price_idx" ON "Product"("status", "price");

-- CreateIndex
CREATE INDEX "Product_status_publishedAt_idx" ON "Product"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Product_sellerId_status_idx" ON "Product"("sellerId", "status");

-- CreateIndex
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_uploadId_key" ON "ProductImage"("productId", "uploadId");

-- CreateIndex
CREATE INDEX "Favorite_productId_idx" ON "Favorite"("productId");

-- CreateIndex
CREATE INDEX "ProductInquiry_productId_createdAt_idx" ON "ProductInquiry"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductInquiry_visitorHash_createdAt_idx" ON "ProductInquiry"("visitorHash", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReport_status_createdAt_idx" ON "ProductReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdPlacement_key_key" ON "AdPlacement"("key");

-- CreateIndex
CREATE INDEX "AdPackage_isActive_sortOrder_idx" ON "AdPackage"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Ad_status_placementId_endsAt_idx" ON "Ad"("status", "placementId", "endsAt");

-- CreateIndex
CREATE INDEX "Ad_userId_createdAt_idx" ON "Ad"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdPayment_txRef_key" ON "AdPayment"("txRef");

-- CreateIndex
CREATE UNIQUE INDEX "AdPayment_providerTransactionId_key" ON "AdPayment"("providerTransactionId");

-- CreateIndex
CREATE INDEX "AdPayment_adId_createdAt_idx" ON "AdPayment"("adId", "createdAt");

-- CreateIndex
CREATE INDEX "AdPayment_status_createdAt_idx" ON "AdPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInquiry" ADD CONSTRAINT "ProductInquiry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInquiry" ADD CONSTRAINT "ProductInquiry_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReport" ADD CONSTRAINT "ProductReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReport" ADD CONSTRAINT "ProductReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPackage" ADD CONSTRAINT "AdPackage_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "AdPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_logoUploadId_fkey" FOREIGN KEY ("logoUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_bannerUploadId_fkey" FOREIGN KEY ("bannerUploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPayment" ADD CONSTRAINT "AdPayment_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPayment" ADD CONSTRAINT "AdPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPayment" ADD CONSTRAINT "AdPayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- =============================================================
-- Supabase: keep the public REST API (anon/authenticated keys) away from these tables.
-- The app connects as the "postgres" owner via Prisma, which bypasses RLS.
-- =============================================================
ALTER TABLE "Upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SellerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Favorite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductInquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdPlacement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdPackage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- Starting data (admins can edit or disable all of this in the admin dashboard)
-- =============================================================
INSERT INTO "Category" ("id", "name", "slug", "icon", "parentId", "sortOrder", "updatedAt") VALUES
  ('cat_consoles',    'Gaming Consoles',    'consoles',    'fa-gamepad', NULL, 1, CURRENT_TIMESTAMP),
  ('cat_controllers', 'Gaming Controllers', 'controllers', 'fa-gamepad', NULL, 2, CURRENT_TIMESTAMP),
  ('cat_accessories', 'Gaming Accessories', 'accessories', 'fa-headset', NULL, 3, CURRENT_TIMESTAMP),
  ('cat_equipment',   'Gaming Equipment',   'equipment',   'fa-desktop', NULL, 4, CURRENT_TIMESTAMP),
  ('cat_services',    'Gaming Services',    'services',    'fa-store',   NULL, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Category" ("id", "name", "slug", "icon", "parentId", "sortOrder", "updatedAt") VALUES
  ('cat_ps5',            'PlayStation 5',             'playstation-5',            'fa-playstation',        'cat_consoles', 1, CURRENT_TIMESTAMP),
  ('cat_ps4',            'PlayStation 4',             'playstation-4',            'fa-playstation',        'cat_consoles', 2, CURRENT_TIMESTAMP),
  ('cat_ps3',            'PlayStation 3',             'playstation-3',            'fa-playstation',        'cat_consoles', 3, CURRENT_TIMESTAMP),
  ('cat_xbox_x',         'Xbox Series X',             'xbox-series-x',            'fa-xbox',               'cat_consoles', 4, CURRENT_TIMESTAMP),
  ('cat_xbox_s',         'Xbox Series S',             'xbox-series-s',            'fa-xbox',               'cat_consoles', 5, CURRENT_TIMESTAMP),
  ('cat_xbox_one',       'Xbox One',                  'xbox-one',                 'fa-xbox',               'cat_consoles', 6, CURRENT_TIMESTAMP),
  ('cat_switch',         'Nintendo Switch',           'nintendo-switch',          'fa-gamepad',            'cat_consoles', 7, CURRENT_TIMESTAMP),
  ('cat_other_consoles', 'Other Consoles',            'other-consoles',           'fa-gamepad',            'cat_consoles', 8, CURRENT_TIMESTAMP),

  ('cat_ctrl_ps5',       'PS5 DualSense Controllers', 'ps5-controllers',          'fa-playstation',        'cat_controllers', 1, CURRENT_TIMESTAMP),
  ('cat_ctrl_ps4',       'PS4 Controllers',           'ps4-controllers',          'fa-playstation',        'cat_controllers', 2, CURRENT_TIMESTAMP),
  ('cat_ctrl_xbox',      'Xbox Controllers',          'xbox-controllers',         'fa-xbox',               'cat_controllers', 3, CURRENT_TIMESTAMP),
  ('cat_ctrl_nintendo',  'Nintendo Controllers',      'nintendo-controllers',     'fa-gamepad',            'cat_controllers', 4, CURRENT_TIMESTAMP),
  ('cat_ctrl_other',     'Other Controllers',         'other-controllers',        'fa-gamepad',            'cat_controllers', 5, CURRENT_TIMESTAMP),

  ('cat_headsets',       'Gaming Headsets',           'gaming-headsets',          'fa-headset',            'cat_accessories', 1, CURRENT_TIMESTAMP),
  ('cat_keyboards',      'Gaming Keyboards',          'gaming-keyboards',         'fa-keyboard',           'cat_accessories', 2, CURRENT_TIMESTAMP),
  ('cat_mice',           'Gaming Mice',               'gaming-mice',              'fa-computer-mouse',     'cat_accessories', 3, CURRENT_TIMESTAMP),
  ('cat_chairs',         'Gaming Chairs',             'gaming-chairs',            'fa-chair',              'cat_accessories', 4, CURRENT_TIMESTAMP),
  ('cat_monitors',       'Gaming Monitors',           'gaming-monitors',          'fa-tv',                 'cat_accessories', 5, CURRENT_TIMESTAMP),
  ('cat_wheels',         'Steering Wheels',           'steering-wheels',          'fa-car',                'cat_accessories', 6, CURRENT_TIMESTAMP),
  ('cat_charging',       'Charging Stations',         'charging-stations',        'fa-plug',               'cat_accessories', 7, CURRENT_TIMESTAMP),
  ('cat_vr',             'VR Equipment',              'vr-equipment',             'fa-vr-cardboard',       'cat_accessories', 8, CURRENT_TIMESTAMP),
  ('cat_cables',         'Cables & Adapters',         'cables-adapters',          'fa-plug',               'cat_accessories', 9, CURRENT_TIMESTAMP),

  ('cat_pcs',            'Gaming PCs',                'gaming-pcs',               'fa-desktop',            'cat_equipment', 1, CURRENT_TIMESTAMP),
  ('cat_gpus',           'Graphics Cards',            'graphics-cards',           'fa-microchip',          'cat_equipment', 2, CURRENT_TIMESTAMP),
  ('cat_ram_storage',    'RAM & Storage',             'ram-storage',              'fa-memory',             'cat_equipment', 3, CURRENT_TIMESTAMP),
  ('cat_laptops',        'Gaming Laptops',            'gaming-laptops',           'fa-laptop',             'cat_equipment', 4, CURRENT_TIMESTAMP),
  ('cat_other_hw',       'Other Gaming Hardware',     'other-hardware',           'fa-microchip',          'cat_equipment', 5, CURRENT_TIMESTAMP),

  ('cat_station_equip',  'Gaming Station Equipment',  'gaming-station-equipment', 'fa-store',              'cat_services', 1, CURRENT_TIMESTAMP),
  ('cat_room_equip',     'Gaming Room Equipment',     'gaming-room-equipment',    'fa-couch',              'cat_services', 2, CURRENT_TIMESTAMP),
  ('cat_other_services', 'Other Products & Services', 'other-services',           'fa-screwdriver-wrench', 'cat_services', 3, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "AdPlacement" ("id", "key", "name", "description", "maxActive", "updatedAt") VALUES
  ('plc_home_sidebar', 'HOME_SIDEBAR', 'Homepage - right side', 'Shown on the right of the homepage under the navigation bar (below the welcome section on phones).', 3, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Example packages start switched OFF with no price: an admin sets prices and activates them.
INSERT INTO "AdPackage" ("id", "placementId", "name", "description", "durationDays", "price", "isActive", "sortOrder", "updatedAt") VALUES
  ('pkg_7d',  'plc_home_sidebar', '7-Day Package',  'One week on the GamePro homepage.',    7,  0, false, 1, CURRENT_TIMESTAMP),
  ('pkg_14d', 'plc_home_sidebar', '14-Day Package', 'Two weeks on the GamePro homepage.',   14, 0, false, 2, CURRENT_TIMESTAMP),
  ('pkg_30d', 'plc_home_sidebar', '30-Day Package', 'A full month on the GamePro homepage.', 30, 0, false, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
