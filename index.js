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
  console.log("logger logged", req.params);
  next();
};

const verifyToken = (req, res, next) => {
  console.log("headers", req.headers);
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
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

    //  Users
    // সব ইউজার আনা (admin দের জন্য)
    app.get("/api/users", async (req, res) => {
      try {
        const result = await userCollection.find().sort({ _id: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // নতুন ইউজার সেভ করা
    app.post("/api/users", async (req, res) => {
      try {
        const userData = req.body;
        const existing = await userCollection.findOne({
          email: userData.email,
        });
        if (existing) {
          return res.send({ acknowledged: true, alreadyExists: true });
        }
        const result = await userCollection.insertOne({
          ...userData,
          role: userData.role || "user",
          createdAt: new Date(),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ✅ SPECIFIC routes — :email এর আগে রাখতে হবে
    app.patch("/api/users/role/:id", async (req, res) => {
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
    });

    app.patch("/api/users/:id/ban", verifyToken, logger, async (req, res) => {
      try {
        const id = req.params.id;
        const { banned } = req.body;
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { banned: banned } },
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.delete("/api/users/:id", async (req, res) => {
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

    app.get("/api/users/by-id/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await userCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ⚠️ GENERIC :email route — সবার শেষে রাখতে হবে
    app.get("/api/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await userCollection.findOne({ email });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/api/books", verifyToken, logger, async (req, res) => {
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

        const cursor = newBookCollection
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(limitNum);

        const result = await cursor.toArray();

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

    app.post("/api/books", async (req, res) => {
      const book = req.body;
      const result = await newBookCollection.insertOne(book);
      res.send(result);
    });

    app.delete("/api/books/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await newBookCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    app.put("/api/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const bookData = req.body;

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
          {
            _id: new ObjectId(id),
          },
          {
            $set: updateFields,
          },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.get("/api/books/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await newBookCollection.findOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    // Bookmarks

    app.get("/api/bookmarks", async (req, res) => {
      try {
        const query = {};
        if (req.query.userId) {
          query.userId = req.query.userId;
        }
        const cursor = bookmarkCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // একটা নির্দিষ্ট বই ইউজার বুকমার্ক করেছে কিনা চেক করা
    app.get("/api/bookmarks/check", async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await bookmarkCollection.findOne({ userId, bookId });
        res.send({ bookmarked: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // বুকমার্ক যোগ করা
    app.post("/api/bookmarks", async (req, res) => {
      try {
        const { userId, bookId } = req.body;

        // ডুপ্লিকেট আটকানো
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

    // বুকমার্ক বাদ দেওয়া
    app.delete("/api/bookmarks", async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await bookmarkCollection.deleteOne({ userId, bookId });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // একাধিক bookId দিয়ে বইয়ের ডিটেলস আনা
    app.post("/api/books/by-ids", async (req, res) => {
      try {
        const { ids } = req.body; // ["id1", "id2", ...]
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.send([]);
        }

        const objectIds = ids.map((id) => new ObjectId(id));
        const cursor = newBookCollection.find({ _id: { $in: objectIds } });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // purchase
    // ---------- Purchases ----------

    app.post("/api/purchases", async (req, res) => {
      try {
        const { userId, bookId, writerId, price, transactionId } = req.body;

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

    app.get("/api/purchases", async (req, res) => {
      try {
        const query = {};
        if (req.query.userId) query.userId = req.query.userId;
        const result = await purchaseCollection
          .find(query)
          .sort({ purchaseDate: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/api/purchases/check", async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await purchaseCollection.findOne({ userId, bookId });
        res.send({ purchased: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/api/purchases/sales", async (req, res) => {
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
    });

    // ইউজারের সব purchase হিস্টোরি আনা
    app.get("/api/purchases", async (req, res) => {
      try {
        const query = {};
        if (req.query.userId) query.userId = req.query.userId;
        const result = await purchaseCollection
          .find(query)
          .sort({ purchaseDate: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Already Purchased চেক
    app.get("/api/purchases/check", async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await purchaseCollection.findOne({ userId, bookId });
        res.send({ purchased: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // Writer এর sales history
    app.get("/api/purchases/sales", async (req, res) => {
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
    });

    app.get("/api/purchases", async (req, res) => {
      try {
        const query = {};
        if (req.query.userId) query.userId = req.query.userId;
        const result = await purchaseCollection
          .find(query)
          .sort({ purchaseDate: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/api/purchases/check", async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await purchaseCollection.findOne({ userId, bookId });
        res.send({ purchased: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // নির্দিষ্ট ইউজারের সব purchase হিস্টোরি আনা
    app.get("/api/purchases", async (req, res) => {
      try {
        const query = {};
        if (req.query.userId) query.userId = req.query.userId;

        const cursor = purchaseCollection
          .find(query)
          .sort({ purchaseDate: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // একটা বই ইউজার কিনেছে কিনা চেক করা (Already Purchased বাটনের জন্য)
    app.get("/api/purchases/check", async (req, res) => {
      try {
        const { userId, bookId } = req.query;
        const result = await purchaseCollection.findOne({ userId, bookId });
        res.send({ purchased: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // sells
    // ব্যাকএন্ডে নতুন route
    app.get("/api/purchases/sales", async (req, res) => {
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
    });

    // ---------- Publishing Fee (Writer verification payment) ----------

    app.post("/api/publishing-fee", async (req, res) => {
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

    app.get("/api/publishing-fee", async (req, res) => {
      try {
        const result = await publishingFeeCollection
          .find()
          .sort({ paidAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/api/publishing-fee/check", async (req, res) => {
      try {
        const { userId } = req.query;
        const result = await publishingFeeCollection.findOne({ userId });
        res.send({ paid: !!result });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });
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
