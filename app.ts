import express from "express";
import cors from "cors";
import { jwtAuthen, secret, generateToken } from './utils/jwtauth';
import { configureGoogleStrategy } from "./auth/googleStrategy";
import { router as index } from "./api/index";
import { router as authlocal } from "./api/auth-local";
import { router as authRoutes } from "./auth/authRoutes";
import { router as createdormitory } from "./api/create-dormitory";

export const app = express();

configureGoogleStrategy();

app.use(express.text());
app.use(express.json());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/", index);
app.use("/auth", authRoutes);
app.use("/authlocal", authlocal);

app.use(jwtAuthen); // middleware ตรวจสอบ JWT

app.use("/createdormitory", createdormitory);

app.use(jwtAuthen, (err: any, req: any, res: any, next: any) => {
  if (err.name === "UnauthorizedError") {
    res.status(err.status).send({ message: err.message });
    return;
  }
  next();
});

// Test Token
app.use("/testtoken", (req, res) => {
    const payload: any = { username: "Aj.M" }; 
    const jwttoken = generateToken(payload, secret);
  res.status(200).json({
    token: jwttoken,
  });
});

