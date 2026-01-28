import express from "express";
import cors from "cors";
import { jwtAuthen, secret, generateToken } from './utils/jwtauth';
import { configureGoogleStrategy } from "./auth/googleStrategy";
import { router as index } from "./api/index";
import { router as authlocal } from "./api/auth-local";
import { router as authRoutes } from "./auth/authRoutes";
import { router as createdormitory } from "./api/create-dormitory";
import { router as addBankRouter } from './api/add-bank';

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

app.use("/", index);
app.use("/auth", authRoutes);
app.use("/authlocal", authlocal);

app.use(jwtAuthen); // middleware ตรวจสอบ JWT

app.use("/createdormitory", createdormitory);
app.use('/banks', addBankRouter);


app.use((err: any, req: any, res: any, next: any) => {
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({ message: "Invalid or missing token" });
  }
  next(err);
});

