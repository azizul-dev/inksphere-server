const express = require("express");
const cors = require("cors");
const app = express();
const port = 8000;
require("dotenv").config();
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const logger = (req, res, next) => {
  console.log(`[${req.method}] ${req.path}`, req.params);
  next();
};

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const database = client.db("ink-sphere");
    const newBookCollection = database.collection("book");
    const bookmarkCollection = database.collection("bookmark");
    const purchaseCollection = database.collection("purchase");
    const userCollection = database.collection("user");
    const publishingFeeCollection = database.collection("publishingFee");
    const sessionCollection = database.collection("session");

    // ─── Middlewares ───────────────────────────────────────────

    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const session = await sessionCollection.findOne({ token });
      if (!session) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const user = await userCollection.findOne({ _id: session.userId });
      if (!user) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      req.user = user;
      next();
    };

    const verifyAdmin = (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyWriter = (req, res, next) => {
      if (req.user?.role !== "writer") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyAdminOrWriter = (req, res, next) => {
      const role = req.user?.role;
      if (role !== "admin" && role !== "writer") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // ─── Users ────────────────────────────────────────────────

    // নতুন ইউজার সেভ করা (public)
    app.post("/api/users", async (req, res) => {
      try {
        const userData = req.body;
        const existing = await userCollection.findOne({
          email: userData.email,
        });
        if (existing) {
          if (userData.role) {
            await userCollection.updateOne(
              { email: userData.email },
              { $set: { role: userData.role } }
            );
          }
          return res.send({ acknowledged: true, alreadyExists: true });
        }
        // POST /api/users এ
        const result = await userCollection.insertOne({
          ...userData,
          role: userData.role || "reader", // "user" এর বদলে "reader"
          createdAt: new Date(),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // সব ইউজার আনা (admin only)
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await userCollection.find().sort({ _id: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // role change (admin only)
    app.patch(
      "/api/users/role/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { role } = req.body;
          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } },
          );
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      },
    );

    // ban/unban (admin only)
    app.patch(
      "/api/users/:id/ban",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { banned } = req.body;
          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { banned } },
          );
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      },
    );

    // user delete (admin only)
    app.delete("/api/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await userCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ID দিয়ে ইউজার আনা (admin only)
    app.get(
      "/api/users/by-id/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const result = await userCollection.findOne({
            _id: new ObjectId(id),
          });
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      },
    );

    // email দিয়ে ইউজার আনা (public — login এর সময় দরকার)
    app.get("/api/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await userCollection.findOne({ email });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ─── Books ────────────────────────────────────────────────

    // সব বই আনা (public)
    app.get("/api/books", async (req, res) => {
      try {
        const {
          writerId,
          status,
          search,
          genre,
          minPrice,
          maxPrice,
          sort,
          page = 1,
          limit = 12,
        } = req.query;

        const query = {};
        if (writerId) query.writerId = writerId;
        if (status) query.status = status;
        if (genre) query.genre = genre;

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { writerName: { $regex: search, $options: "i" } },
          ];
        }

        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = Number(minPrice);
          if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        let sortOption = { _id: -1 };
        if (sort === "price-asc") sortOption = { price: 1 };
        if (sort === "price-desc") sortOption = { price: -1 };
        if (sort === "newest") sortOption = { _id: -1 };

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;
        const totalCount = await newBookCollection.countDocuments(query);

        const result = await newBookCollection
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(limitNum)
          .toArray();

        res.send({
          books: result,
          totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          currentPage: pageNum,
        });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // একটা বই আনা (public)
    app.get("/api/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await newBookCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // multiple id দিয়ে বই আনা (public)
    app.post("/api/books/by-ids", async (req, res) => {
      try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.send([]);
        const objectIds = ids.map((id) => new ObjectId(id));
        const result = await newBookCollection
          .find({ _id: { $in: objectIds } })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // নতুন বই create (writer only)
    app.post("/api/books", verifyToken, verifyWriter, async (req, res) => {
      try {
        const book = req.body;
        const result = await newBookCollection.insertOne(book);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // বই edit (writer নিজেরটা, admin সবটা)
    app.put(
      "/api/books/:id",
      verifyToken,
      verifyAdminOrWriter,
      async (req, res) => {
        try {
          const id = req.params.id;
          const bookData = req.body;

          // writer হলে শুধু নিজের বই edit করতে পারবে
          if (req.user.role === "writer") {
            const book = await newBookCollection.findOne({
              _id: new ObjectId(id),
            });
            if (!book || book.writerId !== req.user._id.toString()) {
              return res.status(403).send({ message: "forbidden access" });
            }
          }

          const allowedFields = [
            "title",
            "genre",
            "price",
            "coverImage",
            "shortDescription",
            "content",
            "status",
          ];

          const updateFields = {};
          allowedFields.forEach((field) => {
            if (bookData[field] !== undefined) {
              updateFields[field] = bookData[field];
            }
          });

          const result = await newBookCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields },
          );
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      },
    );

    // বই delete (writer নিজেরটা, admin সবটা)
    app.delete(
      "/api/books/:id",
      verifyToken,
      verifyAdminOrWriter,
      async (req, res) => {
        try {
          const id = req.params.id;

          // writer হলে শুধু নিজের বই delete করতে পারবে
          if (req.user.role === "writer") {
            const book = await newBookCollection.findOne({
              _id: new ObjectId(id),
            });
            if (!book || book.writerId !== req.user._id.toString()) {
              return res.status(403).send({ message: "forbidden access" });
            }
          }

          const result = await newBookCollection.deleteOne({
            _id: new ObjectId(id),
          });
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      },
    );

    // ─── Bookmarks ────────────────────────────────────────────

    // bookmark check (logged in)
    app.get("/api/bookmarks/check", verifyToken, async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await bookmarkCollection.findOne({ userId, bookId });
        res.send({ bookmarked: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // সব bookmarks আনা (logged in)
    app.get("/api/bookmarks", verifyToken, async (req, res) => {
      try {
        const query = {};
        if (req.query.userId) query.userId = req.query.userId;
        const result = await bookmarkCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // bookmark add (logged in)
    app.post("/api/bookmarks", verifyToken, async (req, res) => {
      try {
        const { userId, bookId } = req.body;
        const existing = await bookmarkCollection.findOne({ userId, bookId });
        if (existing) {
          return res.send({ acknowledged: true, alreadyExists: true });
        }
        const result = await bookmarkCollection.insertOne({
          userId,
          bookId,
          createdAt: new Date(),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // bookmark remove (logged in)
    app.delete("/api/bookmarks", verifyToken, async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await bookmarkCollection.deleteOne({ userId, bookId });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ─── Purchases ────────────────────────────────────────────

    // purchase check (logged in)
    app.get("/api/purchases/check", verifyToken, async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await purchaseCollection.findOne({ userId, bookId });
        res.send({ purchased: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // writer এর sales history (writer only)
    app.get(
      "/api/purchases/sales",
      verifyToken,
      verifyWriter,
      async (req, res) => {
        try {
          const { writerId } = req.query;
          const result = await purchaseCollection
            .find({ writerId })
            .sort({ purchaseDate: -1 })
            .toArray();
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      },
    );

    // নতুন purchase (logged in)
    // নতুন purchase (logged in)
    app.post("/api/purchases", verifyToken, async (req, res) => {
      try {
        const { userId, bookId, writerId, price, transactionId } = req.body;

        // writer নিজের বই কিনতে পারবে না
        const book = await newBookCollection.findOne({
          _id: new ObjectId(bookId),
        });
        if (book && book.writerId === req.user._id.toString()) {
          return res
            .status(403)
            .send({ message: "Writer cannot buy own book" });
        }

        const existing = await purchaseCollection.findOne({ userId, bookId });
        if (existing) {
          return res.send({ acknowledged: true, alreadyExists: true });
        }

        const result = await purchaseCollection.insertOne({
          userId,
          bookId,
          writerId,
          price,
          transactionId,
          purchaseDate: new Date(),
        });

        await newBookCollection.updateOne(
          { _id: new ObjectId(bookId) },
          { $set: { status: "sold" } },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // সব purchases আনা (admin = সব, user = নিজেরটা)
    app.get("/api/purchases", verifyToken, async (req, res) => {
      try {
        const query = {};
        if (req.user.role !== "admin") {
          query.userId = req.query.userId;
        }
        const result = await purchaseCollection
          .find(query)
          .sort({ purchaseDate: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ─── Publishing Fee ───────────────────────────────────────

    // fee paid check (logged in)
    app.get("/api/publishing-fee/check", verifyToken, async (req, res) => {
      try {
        const { userId } = req.query;
        const result = await publishingFeeCollection.findOne({ userId });
        res.send({ paid: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // সব publishing fees (admin only)
    app.get(
      "/api/publishing-fee",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const result = await publishingFeeCollection
            .find()
            .sort({ paidAt: -1 })
            .toArray();
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      },
    );

    // publishing fee payment (logged in)
    app.post("/api/publishing-fee", verifyToken, async (req, res) => {
      try {
        const { userId, email, amount, transactionId } = req.body;
        const existing = await publishingFeeCollection.findOne({ userId });
        if (existing) {
          return res.send({ acknowledged: true, alreadyExists: true });
        }
        const result = await publishingFeeCollection.insertOne({
          userId,
          email,
          amount,
          transactionId,
          paidAt: new Date(),
        });
        await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: "writer" } },
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
