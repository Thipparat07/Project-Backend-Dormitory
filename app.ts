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

export const app = express();

configureGoogleStrategy();

app.use(express.text());
app.use(express.json());

app.use(
  cors({
    origin: "*",
    // origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Routes
app.use(jwtAuthen); // Middleware to check JWT for subsequent routes

app.use("/api/auth", authRoutes);
app.use("/api/dormitories", dormitoryRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/bills", billingRoutes);
app.use("/api/banks", bankRoutes);

app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof UnauthorizedError) {
    return res.status(401).json({
      message: 'Invalid or expired token',
    });
  }
  next(err);
});


