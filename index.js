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

    app.get("/api/books", async (req, res) => {
      const query = {};
      if (req.query.writerId) {
        query.writerId = req.query.writerId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = newBookCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
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