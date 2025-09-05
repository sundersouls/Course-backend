import express from "express";
import { PrismaClient } from "../generated/prisma/index.js";
import { requireAuth } from "../utils/reqAuth.js";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res
        .status(403)
        .json({ error: "Only admins can create categories" });
    }

    const { name, description } = req.body;
    if (!name || name.trim().length < 2) {
      return res
        .status(400)
        .json({ error: "Category name is required (min 2 chars)" });
    }

    const category = await prisma.category.create({
      data: {
        id: nanoid(),
        name: name.trim(),
        description: description?.trim() || null,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

export default router;
