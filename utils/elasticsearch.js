import { Client } from "@elastic/elasticsearch";

class ElasticsearchService {
  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
      auth: process.env.ELASTICSEARCH_AUTH
        ? {
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
          }
        : undefined,
    });

    this.inventoryIndex = "inventories";
    this.itemIndex = "items";
  }

  async initialize() {
    try {
      await this.client.ping();
      console.log("Elasticsearch connected successfully");
      await this.createIndices();
    } catch (error) {
      console.error("Elasticsearch connection failed:", error);
      throw error;
    }
  }

  async createIndices() {
    const inventoryExists = await this.client.indices.exists({
      index: this.inventoryIndex,
    });

    if (!inventoryExists) {
      await this.client.indices.create({
        index: this.inventoryIndex,
        body: {
          mappings: {
            properties: {
              id: { type: "keyword" },
              customId: { type: "keyword" },
              title: {
                type: "text",
                analyzer: "standard",
                fields: {
                  keyword: { type: "keyword" },
                },
              },
              description: {
                type: "text",
                analyzer: "standard",
              },
              isPublic: { type: "boolean" },
              createdAt: { type: "date" },
              updatedAt: { type: "date" },
              creatorId: { type: "keyword" },
              categoryId: { type: "keyword" },
              creator: {
                properties: {
                  id: { type: "keyword" },
                  name: {
                    type: "text",
                    fields: { keyword: { type: "keyword" } },
                  },
                  avatar: { type: "keyword" },
                },
              },
              category: {
                properties: {
                  id: { type: "keyword" },
                  name: {
                    type: "text",
                    fields: { keyword: { type: "keyword" } },
                  },
                },
              },
              itemCount: { type: "integer" },
            },
          },
          settings: {
            analysis: {
              analyzer: {
                inventory_analyzer: {
                  tokenizer: "standard",
                  filter: ["lowercase", "stop", "snowball"],
                },
              },
            },
          },
        },
      });
      console.log("Inventory index created");
    }

    const itemExists = await this.client.indices.exists({
      index: this.itemIndex,
    });

    if (!itemExists) {
      await this.client.indices.create({
        index: this.itemIndex,
        body: {
          mappings: {
            properties: {
              id: { type: "keyword" },
              inventoryId: { type: "keyword" },
              name: {
                type: "text",
                analyzer: "standard",
                fields: {
                  keyword: { type: "keyword" },
                },
              },
              customId: { type: "keyword" },
              values: { type: "object", enabled: false },
              createdAt: { type: "date" },
              updatedAt: { type: "date" },
              inventory: {
                properties: {
                  id: { type: "keyword" },
                  title: {
                    type: "text",
                    fields: { keyword: { type: "keyword" } },
                  },
                  isPublic: { type: "boolean" },
                  creatorId: { type: "keyword" },
                  creator: {
                    properties: {
                      id: { type: "keyword" },
                      name: {
                        type: "text",
                        fields: { keyword: { type: "keyword" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      console.log("Item index created");
    }
  }

  async indexInventory(inventory) {
    try {
      await this.client.index({
        index: this.inventoryIndex,
        id: inventory.id,
        body: {
          id: inventory.id,
          customId: inventory.customId,
          title: inventory.title,
          description: inventory.description,
          isPublic: inventory.isPublic,
          createdAt: inventory.createdAt,
          updatedAt: inventory.updatedAt,
          creatorId: inventory.creatorId,
          categoryId: inventory.categoryId,
          creator: inventory.creator,
          category: inventory.category,
          itemCount: inventory._count?.items || 0,
        },
      });
    } catch (error) {
      console.error("Error indexing inventory:", error);
    }
  }

  async indexItem(item) {
    try {
      await this.client.index({
        index: this.itemIndex,
        id: item.id,
        body: {
          id: item.id,
          inventoryId: item.inventoryId,
          name: item.name,
          customId: item.customId,
          values: item.values,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          inventory: item.inventory,
        },
      });
    } catch (error) {
      console.error("Error indexing item:", error);
    }
  }

  async deleteInventory(inventoryId) {
    try {
      await this.client.delete({
        index: this.inventoryIndex,
        id: inventoryId,
      });
    } catch (error) {
      console.error("Error deleting inventory from index:", error);
    }
  }

  async deleteItem(itemId) {
    try {
      await this.client.delete({
        index: this.itemIndex,
        id: itemId,
      });
    } catch (error) {
      console.error("Error deleting item from index:", error);
    }
  }

  async searchAll(query, options = {}) {
    const { page = 1, size = 20, sortBy = "relevance" } = options;

    const from = (page - 1) * size;

    const [inventoryResults, itemResults] = await Promise.all([
      this.searchInventories(query, {
        page,
        size: Math.ceil(size / 2),
        sortBy,
      }),
      this.searchItems(query, { page, size: Math.ceil(size / 2) }),
    ]);

    return {
      inventories: inventoryResults.inventories || [],
      items: itemResults.items || [],
      inventoryMeta: {
        total: inventoryResults.total || 0,
        page: inventoryResults.page || 1,
        totalPages: inventoryResults.totalPages || 1,
      },
      itemMeta: {
        total: itemResults.total || 0,
        page: itemResults.page || 1,
        totalPages: itemResults.totalPages || 1,
      },
    };
  }

  async searchInventories(query, options = {}) {
    const { page = 1, size = 20, sortBy = "relevance" } = options;

    const from = (page - 1) * size;

    const searchBody = {
      from,
      size,
      query: {
        bool: {
          must: [],
          filter: [],
        },
      },
      sort: [],
      highlight: {
        fields: {
          title: {},
          description: {},
        },
      },
    };

    if (query && query.trim()) {
      searchBody.query.bool.must.push({
        multi_match: {
          query: query.trim(),
          fields: ["title^2", "title.keyword^3", "description"],
          type: "best_fields",
          operator: "and",
        },
      });
    } else {
      searchBody.query.bool.must.push({ match_all: {} });
    }

    switch (sortBy) {
      case "newest":
        searchBody.sort.push({ createdAt: { order: "desc" } });
        break;
      case "oldest":
        searchBody.sort.push({ createdAt: { order: "asc" } });
        break;
      case "title":
        searchBody.sort.push({ "title.keyword": { order: "asc" } });
        break;
      case "items":
        searchBody.sort.push({ itemCount: { order: "desc" } });
        break;
      default:
        if (query && query.trim()) {
          searchBody.sort.push("_score");
        } else {
          searchBody.sort.push({ createdAt: { order: "desc" } });
        }
    }

    try {
      const response = await this.client.search({
        index: this.inventoryIndex,
        body: searchBody,
      });

      return {
        inventories: response.hits.hits.map((hit) => ({
          ...hit._source,
          _score: hit._score,
          _highlight: hit.highlight,
        })),
        total: response.hits.total.value,
        page,
        size,
        totalPages: Math.ceil(response.hits.total.value / size),
      };
    } catch (error) {
      console.error("Error searching inventories:", error);
      throw error;
    }
  }

  async searchItems(query, options = {}) {
    const { page = 1, size = 20, inventoryId = null } = options;

    const from = (page - 1) * size;

    const searchBody = {
      from,
      size,
      query: {
        bool: {
          must: [],
          filter: [],
        },
      },
      sort: [{ _score: { order: "desc" } }, { createdAt: { order: "desc" } }],
      highlight: {
        fields: {
          name: {},
          customId: {},
        },
      },
    };

    if (query && query.trim()) {
      searchBody.query.bool.must.push({
        multi_match: {
          query: query.trim(),
          fields: ["name^2", "customId^1.5", "inventory.title"],
          type: "cross_fields",
        },
      });
    } else {
      searchBody.query.bool.must.push({ match_all: {} });
    }

    if (inventoryId) {
      searchBody.query.bool.filter.push({
        term: { inventoryId },
      });
    }

    try {
      const response = await this.client.search({
        index: this.itemIndex,
        body: searchBody,
      });

      return {
        items: response.hits.hits.map((hit) => ({
          ...hit._source,
          _score: hit._score,
          _highlight: hit.highlight,
        })),
        total: response.hits.total.value,
        page,
        size,
        totalPages: Math.ceil(response.hits.total.value / size),
      };
    } catch (error) {
      console.error("Error searching items:", error);
      throw error;
    }
  }

  async bulkIndexItems(items) {
    if (!items || items.length === 0) return;

    const body = [];
    items.forEach((item) => {
      body.push({
        index: {
          _index: this.itemIndex,
          _id: item.id,
        },
      });
      body.push({
        id: item.id,
        inventoryId: item.inventoryId,
        name: item.name,
        customId: item.customId,
        values: item.values,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        inventory: item.inventory,
      });
    });

    try {
      await this.client.bulk({ body });
      console.log(`Bulk indexed ${items.length} items`);
    } catch (error) {
      console.error("Error bulk indexing items:", error);
    }
  }
}

export default ElasticsearchService;
