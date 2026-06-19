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

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
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

    // delete api
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

        const result = await newBookCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              title: bookData.title,
              genre: bookData.genre,
              price: bookData.price,
              coverImage: bookData.coverImage,
              shortDescription: bookData.shortDescription,
              content: bookData.content,
              status: bookData.status,
            },
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

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
