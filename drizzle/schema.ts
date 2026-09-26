import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  emailNormalized: varchar("emailNormalized", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  passwordResetRequired: boolean("passwordResetRequired").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "staff"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const authSessions = mysqlTable("auth_sessions", {
  id: int("id").autoincrement().primaryKey(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("auth_sessions_user_id_idx").on(table.userId), index("auth_sessions_expires_at_idx").on(table.expiresAt)]);

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull().references(() => categories.id),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  priceCents: int("priceCents").notNull(),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const productOptions = mysqlTable("product_options", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  priceCents: int("priceCents").default(0).notNull(),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  phone: varchar("phone", { length: 24 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 24 }).notNull().unique(),
  orderNumber: varchar("orderNumber", { length: 24 }).unique(),
  customerId: int("customerId").notNull().references(() => customers.id),
  deliveryType: mysqlEnum("deliveryType", ["delivery", "pickup"]).default("delivery").notNull(),
  status: mysqlEnum("status", ["received", "confirmed", "preparing", "ready", "out_for_delivery", "delivered", "cancelled", "rejected"]).default("received").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["pix", "cash", "card_delivery", "card_pickup"]).notNull(),
  changeForCents: int("changeForCents"),
  subtotalCents: int("subtotalCents").notNull(),
  deliveryFeeCents: int("deliveryFeeCents").default(0).notNull(),
  discountCents: int("discountCents").default(0).notNull(),
  totalCents: int("totalCents").notNull(),
  postalCode: varchar("postalCode", { length: 16 }),
  street: varchar("street", { length: 180 }),
  streetNumber: varchar("streetNumber", { length: 32 }),
  complement: varchar("complement", { length: 140 }),
  neighborhood: varchar("neighborhood", { length: 120 }),
  city: varchar("city", { length: 120 }),
  reference: varchar("reference", { length: 200 }),
  customerNote: varchar("customerNote", { length: 500 }),
  internalNote: varchar("internalNote", { length: 500 }),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("orders_status_created_idx").on(table.status, table.createdAt), index("orders_created_at_idx").on(table.createdAt)]);

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: int("productId").references(() => products.id, { onDelete: "set null" }),
  productName: varchar("productName", { length: 160 }).notNull(),
  unitPriceCents: int("unitPriceCents").notNull(),
  quantity: int("quantity").notNull(),
  note: varchar("note", { length: 500 }),
});

export const orderItemOptions = mysqlTable("order_item_options", {
  id: int("id").autoincrement().primaryKey(),
  orderItemId: int("orderItemId").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  optionName: varchar("optionName", { length: 120 }).notNull(),
  priceCents: int("priceCents").notNull(),
});

export const orderStatusHistory = mysqlTable("order_status_history", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 32 }).notNull(),
  note: varchar("note", { length: 240 }),
  changedBy: varchar("changedBy", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("order_status_history_order_created_idx").on(table.orderId, table.createdAt)]);

export const storeSettings = mysqlTable("store_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 140 }).default("Sua loja").notNull(),
  tagline: varchar("tagline", { length: 240 }).default("Feito com carinho, do nosso balcão pra sua casa.").notNull(),
  logoUrl: text("logoUrl"),
  bannerUrl: text("bannerUrl"),
  brandColor: varchar("brandColor", { length: 7 }).default("#C84B2F").notNull(),
  phone: varchar("phone", { length: 24 }).default("").notNull(),
  address: varchar("address", { length: 240 }).default("").notNull(),
  businessHours: text("businessHours"),
  averageDeliveryMinutes: int("averageDeliveryMinutes").default(35).notNull(),
  timeZone: varchar("timeZone", { length: 64 }).default("America/Sao_Paulo").notNull(),
  deliveryFeeCents: int("deliveryFeeCents").default(0).notNull(),
  minimumOrderCents: int("minimumOrderCents").default(0).notNull(),
  isOpen: boolean("isOpen").default(false).notNull(),
  closedMessage: varchar("closedMessage", { length: 200 }).default("Voltamos às 18h.").notNull(),
  whatsappMessage: text("whatsappMessage"),
  paymentMethods: text("paymentMethods"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductOption = typeof productOptions.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
