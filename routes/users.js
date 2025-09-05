import express from "express";
import { PrismaClient } from "../generated/prisma/index.js";
import { requireAuth } from "../utils/reqAuth.js";

const prisma = new PrismaClient();
const router = express.Router();

router.get("/search", requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q.trim(), mode: 'insensitive' } },
          { email: { contains: q.trim(), mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true
      },
      take: 10
    });

    res.json({ users });
  } catch (error) {
    console.error("User search error:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

export default router;
