import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import inventoryRoutes from "./routes/inventory.js";
import userRoutes from "./routes/user.js";
import "./controller/passport.js";

const app = express();

app.use(cors({ origin: `${process.env.FRONTEND_URL}`, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/users", userRoutes);

app.listen(process.env.PORT, () =>
  console.log(`Server running ${process.env.PORT}`),
);
