import express from "express";
import { PrismaClient } from "../generated/prisma/index.js";
import { requireAuthAdmin } from "../utils/reqAuth.js";

const prisma = new PrismaClient();
const router = express.Router();

router.get("/all", requireAuthAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json({ users });
  } catch (error) {
    console.error("User pull error:", error);
    res.status(500).json({ error: "User search failed" });
  }
});

router.delete("/:id", requireAuthAdmin, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error("User delete error:", error);
    res.status(500).json({ error: "User deletion failed" });
  }
});

router.patch("/:id/block", requireAuthAdmin, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBlocked: true },
    });
    res.json(user);
  } catch (error) {
    console.error("Block user error:", error);
    res.status(500).json({ error: "User block failed" });
  }
});

router.patch("/:id/unblock", requireAuthAdmin, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBlocked: false },
    });
    res.json(user);
  } catch (error) {
    console.error("Unblock user error:", error);
    res.status(500).json({ error: "User unblock failed" });
  }
});

router.patch("/:id/make-admin", requireAuthAdmin, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isAdmin: true },
    });
    res.json(user);
  } catch (error) {
    console.error("Make admin error:", error);
    res.status(500).json({ error: "Make admin failed" });
  }
});

router.patch("/:id/remove-admin", requireAuthAdmin, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isAdmin: false },
    });
    res.json(user);
  } catch (error) {
    console.error("Remove admin error:", error);
    res.status(500).json({ error: "Remove admin failed" });
  }
});

export default router;
