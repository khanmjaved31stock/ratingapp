import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import { getMongoUri } from "@/lib/mongo-uri";
import { getSuperAdminBootstrapPassword } from "@/lib/super-admin-bootstrap";

const DEFAULT_SUPER_ADMIN_EMAIL = "Super-Admin-Mjaved@gmail.com";

let cached = globalThis.mongooseCache;

if (!cached) {
  cached = globalThis.mongooseCache = {
    connection: null,
    connectionPromise: null,
    seedPromise: null,
  };
}

async function seedSuperAdmin() {
  if (cached.seedPromise) {
    return cached.seedPromise;
  }

  cached.seedPromise = (async () => {
    const email = process.env.SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL;
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Super Admin bootstrap credentials are invalid.");
    }

    const existing = await User.findOne({ email: normalizedEmail }).select("role");
    const password = getSuperAdminBootstrapPassword(existing, process.env.SUPER_ADMIN_PASSWORD);
    if (!password) return;

    const hashedPassword = await bcrypt.hash(password, 12);
    try {
      await User.create({
        name: "Super Admin",
        email: normalizedEmail,
        password: hashedPassword,
        role: "superAdmin",
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const concurrentSeed = await User.exists({
        email: normalizedEmail,
        role: "superAdmin",
      });
      if (!concurrentSeed) throw error;
    }
  })().catch((error) => {
    cached.seedPromise = null;
    throw error;
  });

  return cached.seedPromise;
}

export default async function connectDB() {
  const mongoUri = getMongoUri();
  if (!mongoUri) {
    throw new Error("MONGODB_URI or MONGO_URI is not configured.");
  }

  if (!cached.connection) {
    if (!cached.connectionPromise) {
      cached.connectionPromise = mongoose
        .connect(mongoUri)
        .then((mongooseInstance) => {
          cached.connection = mongooseInstance;
          return mongooseInstance;
        })
        .catch((error) => {
          cached.connectionPromise = null;
          cached.connection = null;
          console.error("MongoDB connection failed:", error?.name || "UnknownError");
          throw new Error("Unable to connect to the database.", { cause: error });
        });
    }

    await cached.connectionPromise;
  }

  try {
    await seedSuperAdmin();
  } catch (error) {
    console.error("Super Admin database seeding failed:", error?.name || "UnknownError");
    throw new Error("Unable to initialize the Super Admin account.", { cause: error });
  }

  return cached.connection;
}
