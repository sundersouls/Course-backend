import express from "express";
import { PrismaClient } from "../generated/prisma/index.js";
import { requireAuth } from "../utils/reqAuth.js";
import { nanoid } from "nanoid";
import multer from "multer";
import cloudinaryModule from "cloudinary";
import ElasticsearchService from "../utils/elasticsearch.js";

const cloudinary = cloudinaryModule.v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const prisma = new PrismaClient();
const router = express.Router();
const elasticsearchService = new ElasticsearchService();

let esInitialized = false;
const initializeElasticsearch = async () => {
  if (!esInitialized) {
    try {
      await elasticsearchService.initialize();
      esInitialized = true;
      console.log("Elasticsearch initialized successfully");
    } catch (error) {
      console.warn(
        "Elasticsearch initialization failed, falling back to database search:",
        error.message,
      );
      esInitialized = false;
    }
  }
};

initializeElasticsearch();

function userCanViewInventory(user, inventory, writeAccessList = []) {
  if (!inventory) return false;
  if (inventory.isPublic) return true;
  if (!user) return false;
  if (user.isAdmin) return true;
  if (inventory.creatorId === user.id) return true;
  if (writeAccessList.some((wa) => wa.userId === user.id)) return true;
  return false;
}

function userCanWriteInventory(user, inventory, writeAccessList = []) {
  if (!user || !inventory) return false;
  if (user.isAdmin) return true;
  if (inventory.creatorId === user.id) return true;
  if (writeAccessList.some((wa) => wa.userId === user.id)) return true;
  return false;
}

function generateRandomBits(bits) {
  const max = 2 ** bits;
  return Math.floor(Math.random() * max);
}

function padNumber(n, width) {
  const s = String(Math.floor(Math.abs(n)));
  if (s.length >= width) return s;
  return "0".repeat(width - s.length) + s;
}

function buildCustomIdFromFormat(format, ctx) {
  if (!Array.isArray(format)) return null;
  let out = "";
  for (const el of format) {
    switch (el.type) {
      case "text":
        out += String(el.value || "");
        break;
      case "rand20":
        out += generateRandomBits(20);
        break;
      case "rand32":
        out += generateRandomBits(32);
        break;
      case "rand6d":
        out += padNumber(generateRandomBits(20) % 1000000, 6);
        break;
      case "rand9d":
        out += padNumber(generateRandomBits(32) % 1000000000, 9);
        break;
      case "guid":
        out += nanoid();
        break;
      case "datetime":
        out += new Date(ctx.now || Date.now()).toISOString();
        break;
      case "sequence":
        out += padNumber(ctx.sequence || 0, el.minWidth || 1);
        break;
      default:
        out += "";
    }
  }
  return out;
}

router.get("/search", async (req, res) => {
  try {
    const {
      q,
      type = "all",
      page = 1,
      size = 20,
      sortBy = "relevance",
    } = req.query;

    if (!q || q.trim().length < 2) {
      return res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
    }

    if (!esInitialized) {
      return res.status(503).json({ error: "Search service is not available" });
    }

    const searchOptions = {
      page: parseInt(page),
      size: parseInt(size),
      sortBy,
    };

    let results = {};
    results = await elasticsearchService.searchAll(q.trim(), searchOptions);
    res.json(results);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/latest", async (req, res) => {
  try {
    const inventories = await prisma.inventory.findMany({
      where: { isPublic: true },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        // category: true,
        tags: { include: { tag: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    res.json({ inventories });
  } catch (error) {
    console.error("Latest inventories error:", error);
    res.status(500).json({ error: "Failed to fetch latest inventories" });
  }
});

router.get("/popular", async (req, res) => {
  try {
    const inventories = await prisma.inventory.findMany({
      where: { isPublic: true },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        // category: true,
        tags: { include: { tag: true } },
        _count: { select: { items: true } },
      },
      orderBy: { items: { _count: "desc" } },
      take: 5,
    });
    res.json({ inventories });
  } catch (error) {
    console.error("Popular inventories error:", error);
    res.status(500).json({ error: "Failed to fetch popular inventories" });
  }
});

router.get("/tags", async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: { select: { inventories: true } },
      },
      orderBy: { inventories: { _count: "desc" } },
    });
    res.json({ tags });
  } catch (error) {
    console.error("Tags error:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

router.get("/tags/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ tags: [] });
    }

    const tags = await prisma.tag.findMany({
      where: {
        name: {
          contains: q.trim(),
          mode: "insensitive",
        },
      },
      include: {
        _count: { select: { inventories: true } },
      },
      orderBy: { inventories: { _count: "desc" } },
      take: 10,
    });

    res.json({ tags });
  } catch (error) {
    console.error("Tag search error:", error);
    res.status(500).json({ error: "Failed to search tags" });
  }
});

router.get("/tag/:tagName", async (req, res) => {
  try {
    const { tagName } = req.params;
    const tag = await prisma.tag.findUnique({
      where: { name: tagName },
      include: {
        inventories: {
          include: {
            creator: { select: { id: true, name: true, avatar: true } },
            category: true,
            tags: { include: { tag: true } },
            _count: { select: { items: true } },
          },
        },
      },
    });
    if (!tag) return res.status(404).json({ error: "Tag not found" });
    res.json({ tag, inventories: tag.inventories });
  } catch (error) {
    console.error("Tag inventories error:", error);
    res.status(500).json({ error: "Failed to fetch tag inventories" });
  }
});

router.get("/my", requireAuth, async (req, res) => {
  try {
    const inventories = await prisma.inventory.findMany({
      where: { creatorId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        writeAccess: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        category: true,
        tags: { include: { tag: true } },
        _count: { select: { items: true } },
      },
    });
    res.json({ inventories });
  } catch (error) {
    console.error("Fetch my inventories error:", error);
    res.status(500).json({ error: "Failed to fetch inventories" });
  }
});

router.get("/accessible", requireAuth, async (req, res) => {
  try {
    const inventories = await prisma.inventory.findMany({
      where: { writeAccess: { some: { userId: req.user.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        writeAccess: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        category: true,
        tags: { include: { tag: true } },
        _count: { select: { items: true } },
      },
    });
    res.json({ inventories });
  } catch (error) {
    console.error("Fetch accessible inventories error:", error);
    res.status(500).json({ error: "Failed to fetch inventories" });
  }
});

router.post("/create", requireAuth, async (req, res) => {
  try {
    const { title, description, image, isPublic, categoryId, tags } =
      req.body || {};
    if (!title || title.trim().length < 3) {
      return res
        .status(400)
        .json({ error: "Title must be at least 3 characters" });
    }

    const newInventory = await prisma.inventory.create({
      data: {
        id: nanoid(),
        customId: nanoid(),
        title: title.trim(),
        description: description?.trim() || null,
        image: image?.trim() || null,
        isPublic: Boolean(isPublic),
        categoryId: categoryId || null,
        creatorId: req.user.id,
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        writeAccess: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        category: true,
        tags: { include: { tag: true } },
      },
    });

    if (esInitialized) {
      try {
        await elasticsearchService.indexInventory(newInventory);
      } catch (error) {
        console.error("Error indexing new inventory:", error);
      }
    }

    if (Array.isArray(tags) && tags.length > 0) {
      for (const tagName of tags) {
        let tag = await prisma.tag.findUnique({ where: { name: tagName } });
        if (!tag) {
          tag = await prisma.tag.create({
            data: { id: nanoid(), name: tagName },
          });
        }
        await prisma.inventoryTag.create({
          data: { id: nanoid(), inventoryId: newInventory.id, tagId: tag.id },
        });
      }
    }

    res.status(201).json(newInventory);
  } catch (error) {
    console.error("Create inventory error:", error);
    res.status(500).json({ error: "Failed to create inventory" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.inventory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Inventory not found" });
    }
    if (existing.creatorId !== req.user.id && !req.user.isAdmin) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this inventory" });
    }

    const { title, description, image, isPublic, categoryId, tags, version } =
      req.body || {};

    if (version && version !== existing.version) {
      return res
        .status(409)
        .json({ error: "Inventory was modified by another user" });
    }

    const updated = await prisma.inventory.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title) } : {}),
        ...(description !== undefined
          ? { description: description || null }
          : {}),
        ...(image !== undefined ? { image: image || null } : {}),
        ...(isPublic !== undefined ? { isPublic: Boolean(isPublic) } : {}),
        ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
        version: { increment: 1 },
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        writeAccess: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        category: true,
        tags: { include: { tag: true } },
      },
    });

    if (Array.isArray(tags)) {
      await prisma.inventoryTag.deleteMany({ where: { inventoryId: id } });
      for (const tagName of tags) {
        let tag = await prisma.tag.findUnique({ where: { name: tagName } });
        if (!tag) {
          tag = await prisma.tag.create({
            data: { id: nanoid(), name: tagName },
          });
        }
        await prisma.inventoryTag.create({
          data: { id: nanoid(), inventoryId: id, tagId: tag.id },
        });
      }
    }

    res.json(updated);
  } catch (error) {
    console.error("Update inventory error:", error);
    res.status(500).json({ error: "Failed to update inventory" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.inventory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Inventory not found" });
    }
    if (existing.creatorId !== req.user.id && !req.user.isAdmin) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this inventory" });
    }

    if (existing.image && existing.image.includes("cloudinary.com")) {
      try {
        const publicId = existing.image.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId);
        console.log("Deleted image from Cloudinary:", publicId);
      } catch (cloudinaryError) {
        console.error(
          "Failed to delete image from Cloudinary:",
          cloudinaryError,
        );
      }
    }

    await prisma.inventory.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete inventory error:", error);
    res.status(500).json({ error: "Failed to delete inventory" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const inventory = await prisma.inventory.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        writeAccess: true,
        category: true,
        tags: { include: { tag: true } },
      },
    });
    if (!inventory)
      return res.status(404).json({ error: "Inventory not found" });

    if (!inventory.isPublic && req.user) {
      if (!userCanViewInventory(req.user, inventory, inventory.writeAccess)) {
        return res
          .status(403)
          .json({ error: "Not authorized to view this inventory" });
      }
    }

    res.json(inventory);
  } catch (error) {
    console.error("Get inventory error:", error);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

function mapInventoryToFields(inv) {
  const result = [];
  if (inv.customString1State)
    result.push({
      key: "customString1",
      type: "text",
      label: inv.customString1Name || "",
    });
  if (inv.customString2State)
    result.push({
      key: "customString2",
      type: "text",
      label: inv.customString2Name || "",
    });
  if (inv.customString3State)
    result.push({
      key: "customString3",
      type: "text",
      label: inv.customString3Name || "",
    });
  if (inv.customInt1State)
    result.push({
      key: "customInt1",
      type: "number",
      label: inv.customInt1Name || "",
    });
  if (inv.customInt2State)
    result.push({
      key: "customInt2",
      type: "number",
      label: inv.customInt2Name || "",
    });
  if (inv.customInt3State)
    result.push({
      key: "customInt3",
      type: "number",
      label: inv.customInt3Name || "",
    });
  if (inv.customBool1State)
    result.push({
      key: "customBool1",
      type: "boolean",
      label: inv.customBool1Name || "",
    });
  if (inv.customBool2State)
    result.push({
      key: "customBool2",
      type: "boolean",
      label: inv.customBool2Name || "",
    });
  if (inv.customBool3State)
    result.push({
      key: "customBool3",
      type: "boolean",
      label: inv.customBool3Name || "",
    });
  return result;
}

router.get("/:id/fields", async (req, res) => {
  try {
    const { id } = req.params;
    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (
      !inv.isPublic &&
      req.user &&
      !userCanViewInventory(req.user, inv, inv.writeAccess)
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }
    res.json({ fields: mapInventoryToFields(inv) });
  } catch (error) {
    console.error("Get fields error:", error);
    res.status(500).json({ error: "Failed to fetch fields" });
  }
});

router.put("/:id/fields", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { fields } = req.body || {};
    const inv = await prisma.inventory.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (!(req.user.isAdmin || inv.creatorId === req.user.id)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const updates = {
      customString1State: false,
      customString1Name: null,
      customString2State: false,
      customString2Name: null,
      customString3State: false,
      customString3Name: null,
      customInt1State: false,
      customInt1Name: null,
      customInt2State: false,
      customInt2Name: null,
      customInt3State: false,
      customInt3Name: null,
      customBool1State: false,
      customBool1Name: null,
      customBool2State: false,
      customBool2Name: null,
      customBool3State: false,
      customBool3Name: null,
    };

    const apply = (list, type, prefix) => {
      list
        .filter((f) => f.type === type)
        .slice(0, 3)
        .forEach((f, idx) => {
          const num = idx + 1;
          updates[`${prefix}${num}State`] = true;
          updates[`${prefix}${num}Name`] = f.label || f.key || null;
        });
    };

    apply(fields || [], "text", "customString");
    apply(fields || [], "number", "customInt");
    apply(fields || [], "boolean", "customBool");

    const updated = await prisma.inventory.update({
      where: { id },
      data: updates,
    });
    res.json({ fields: mapInventoryToFields(updated) });
  } catch (error) {
    console.error("Update fields error:", error);
    res.status(500).json({ error: "Failed to update fields" });
  }
});

router.get("/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (
      !inv.isPublic &&
      req.user &&
      !userCanViewInventory(req.user, inv, inv.writeAccess)
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const items = await prisma.item.findMany({
      where: { inventoryId: id },
      orderBy: { createdAt: "desc" },
      include: {
        likes: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { likes: true } },
      },
    });
    res.json({ items });
  } catch (error) {
    console.error("Get items error:", error);
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

router.post("/:id/items", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, values, customId: customIdInput } = req.body || {};
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ error: "Item name is required" });
    }
    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (!userCanWriteInventory(req.user, inv, inv.writeAccess)) {
      return res.status(403).json({ error: "Not authorized to add items" });
    }
    const item = await prisma.$transaction(async (tx) => {
      let sequence = inv.nextSequence || 1;
      let customId = customIdInput;
      if (!customId) {
        customId = buildCustomIdFromFormat(inv.customIdFormat, {
          now: Date.now(),
          sequence,
        });
      }
      const created = await tx.item.create({
        data: {
          id: nanoid(),
          inventoryId: id,
          name: String(name),
          values: values || {},
          customId,
          sequence,
        },
      });
      if (!customIdInput) {
        await tx.inventory.update({
          where: { id },
          data: { nextSequence: sequence + 1 },
        });
      }
      return created;
    });
    if (esInitialized) {
      try {
        await elasticsearchService.indexInventory(item);
      } catch (error) {
        console.error("Error indexing new inventory:", error);
      }
    }
    res.status(201).json(item);
  } catch (error) {
    console.error("Create item error:", error);
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({ error: "Custom ID already exists in this inventory" });
    }
    res.status(500).json({ error: "Failed to create item" });
  }
});

router.put("/:id/items/:itemId", requireAuth, async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { name, values, customId, version } = req.body || {};

    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (!userCanWriteInventory(req.user, inv, inv.writeAccess)) {
      return res.status(403).json({ error: "Not authorized to edit items" });
    }

    const existing = await prisma.item.findUnique({ where: { id: itemId } });
    if (!existing) return res.status(404).json({ error: "Item not found" });
    if (existing.inventoryId !== id)
      return res
        .status(400)
        .json({ error: "Item does not belong to this inventory" });

    if (version && version !== existing.version) {
      return res
        .status(409)
        .json({ error: "Item was modified by another user" });
    }

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(values !== undefined ? { values } : {}),
        ...(customId !== undefined ? { customId } : {}),
        version: { increment: 1 },
      },
    });
    res.json(updated);
  } catch (error) {
    console.error("Update item error:", error);
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({ error: "Custom ID already exists in this inventory" });
    }
    res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/:id/items/:itemId", requireAuth, async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (!userCanWriteInventory(req.user, inv, inv.writeAccess)) {
      return res.status(403).json({ error: "Not authorized to delete items" });
    }

    const existing = await prisma.item.findUnique({ where: { id: itemId } });
    if (!existing) return res.status(404).json({ error: "Item not found" });
    if (existing.inventoryId !== id)
      return res
        .status(400)
        .json({ error: "Item does not belong to this inventory" });

    await prisma.item.delete({ where: { id: itemId } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete item error:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

router.post("/:id/items/:itemId/like", requireAuth, async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (
      !inv.isPublic &&
      req.user &&
      !userCanViewInventory(req.user, inv, inv.writeAccess)
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const existing = await prisma.item.findUnique({ where: { id: itemId } });
    if (!existing) return res.status(404).json({ error: "Item not found" });
    if (existing.inventoryId !== id)
      return res
        .status(400)
        .json({ error: "Item does not belong to this inventory" });

    const existingLike = await prisma.like.findUnique({
      where: { itemId_userId: { itemId, userId: req.user.id } },
    });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      res.json({ liked: false });
    } else {
      await prisma.like.create({
        data: { id: nanoid(), itemId, userId: req.user.id },
      });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error("Toggle like error:", error);
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

router.get("/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (
      !inv.isPublic &&
      req.user &&
      !userCanViewInventory(req.user, inv, inv.writeAccess)
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const comments = await prisma.comment.findMany({
      where: { inventoryId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    res.json({ comments });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body || {};
    if (!content || String(content).trim().length === 0) {
      return res.status(400).json({ error: "Content is required" });
    }
    const inv = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (
      !inv.isPublic &&
      !userCanViewInventory(req.user, inv, inv.writeAccess)
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const comment = await prisma.comment.create({
      data: {
        id: nanoid(),
        inventoryId: id,
        userId: req.user.id,
        content: String(content),
      },
    });
    res.status(201).json(comment);
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

router.put("/:id/access", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds = [], isPublic } = req.body || {};
    const inv = await prisma.inventory.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (!(req.user.isAdmin || inv.creatorId === req.user.id)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (typeof isPublic === "boolean") {
      await prisma.inventory.update({ where: { id }, data: { isPublic } });
    }

    await prisma.writeAccess.deleteMany({ where: { inventoryId: id } });
    if (Array.isArray(userIds) && userIds.length) {
      await prisma.writeAccess.createMany({
        data: userIds.map((uid) => ({
          userId: uid,
          inventoryId: id,
          grantedBy: req.user.id,
        })),
        skipDuplicates: true,
      });
    }

    const updated = await prisma.inventory.findUnique({
      where: { id },
      include: { writeAccess: true },
    });
    res.json({ isPublic: updated.isPublic, writeAccess: updated.writeAccess });
  } catch (error) {
    console.error("Update access error:", error);
    res.status(500).json({ error: "Failed to update access" });
  }
});

router.put("/:id/numbers", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const inv = await prisma.inventory.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ error: "Inventory not found" });
    if (!(req.user.isAdmin || inv.creatorId === req.user.id)) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const { format, resetSequenceTo } = req.body || {};
    const updated = await prisma.inventory.update({
      where: { id },
      data: {
        ...(Array.isArray(format) ? { customIdFormat: format } : {}),
        ...(Number.isInteger(resetSequenceTo) && resetSequenceTo >= 0
          ? { nextSequence: resetSequenceTo }
          : {}),
      },
    });
    res.json({
      customIdFormat: updated.customIdFormat,
      nextSequence: updated.nextSequence,
    });
  } catch (error) {
    console.error("Numbers settings error:", error);
    res.status(500).json({ error: "Failed to save numbers" });
  }
});

router.post(
  "/upload-image",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "File must be an image" });
      }

      if (req.file.size > 5 * 1024 * 1024) {
        return res
          .status(400)
          .json({ error: "File size must be less than 5MB" });
      }

      console.log(
        "Uploading file:",
        req.file.originalname,
        "Size:",
        req.file.size,
      );

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "inventories",
            resource_type: "image",
            transformation: [{ width: 1200, height: 1200, crop: "limit" }],
          },
          (error, uploaded) => {
            if (error) {
              console.error("Cloudinary upload error:", error);
              res
                .status(500)
                .json({ error: "Upload failed: " + error.message });
              resolve();
            } else {
              console.log("Upload successful:", uploaded.secure_url);
              res.json({
                url: uploaded.secure_url,
                publicId: uploaded.public_id,
              });
              resolve();
            }
          },
        );

        uploadStream.end(req.file.buffer);
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Upload failed: " + error.message });
    }
  },
);

export default router;
