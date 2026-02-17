import express from "express";
import cors from "cors";
import { UnauthorizedError } from 'express-jwt';
import { jwtAuthen } from './src/utils/jwtauth';
import { configureGoogleStrategy } from "./src/config/googleStrategy";
import authRoutes from "./src/routes/authRoutes";
import dormitoryRoutes from "./src/routes/dormitoryRoutes";
import bankRoutes from "./src/routes/bankRoutes";
import tenantRoutes from "./src/routes/tenantRoutes";
import billingRoutes from "./src/routes/billingRoutes";
import { RES_MESSAGES } from "./src/constants/responseMessages";
import passport from "passport";

export const app = express();

configureGoogleStrategy();

app.use(express.text());
app.use(express.json());
app.use(passport.initialize());

app.use(
  cors({
    origin: "*",
    // origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// PUBLIC
app.use("/api/auth", authRoutes);

// PROTECTED
app.use("/api/dormitories", jwtAuthen, dormitoryRoutes);
app.use("/api/tenants", jwtAuthen, tenantRoutes);
app.use("/api/bills", jwtAuthen, billingRoutes);
app.use("/api/banks", jwtAuthen, bankRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: RES_MESSAGES.GLOBAL.ROUTE_NOT_FOUND
  });
});

// ERROR HANDLER
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Error Details:", err);

  if (err instanceof UnauthorizedError) {
    return res.status(401).json({
      status: "error",
      message: RES_MESSAGES.AUTH.INVALID_TOKEN
    });
  }

  res.status(err.status || 500).json({
    status: "error",
    message: RES_MESSAGES.GLOBAL.INTERNAL_SERVER_ERROR,
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});
