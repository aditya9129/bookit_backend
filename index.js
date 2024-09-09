const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
require('dotenv').config();

const User = require('./models/user');
const Places = require('./models/Places');
const Booking = require('./models/Booking');

const app = express();

// CORS configuration
const allowedOrigins = ['https://bookitfrontend-s0ns.onrender.com','https://aesthetic-fudge-cb772e.netlify.app',process.env.BASE_URL, 'http://localhost:5173'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = process.env.JWT_SECRET;
const bucket = process.env.S3_BUCKET_NAME;

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// S3 upload function
async function uploadToS3(file) {
  const client = new S3Client({
    region: 'eu-north-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });

  const ext = mime.extension(file.mimetype);
  const newFilename = `${Date.now()}.${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Body: fs.createReadStream(file.path),
    Key: newFilename,
    ContentType: file.mimetype,
    ACL: 'public-read',
  }));

  return `https://${bucket}.s3.amazonaws.com/${newFilename}`;
}

// Routes
app.post("/register", async (req, res) => {
  const { name, email, pass } = req.body;
  try {
    let existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return res.status(422).json({ error: 'Email already exists' });
    }
    const hashedPassword = bcrypt.hashSync(pass, bcryptSalt);
    const newUser = new User({ name, email, pass: hashedPassword });
    await newUser.save();
    
    const token = jwt.sign({ email: newUser.email, id: newUser._id }, jwtSecret);
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }).status(200).json({ message: 'Registration successful', user: { name: newUser.name, email: newUser.email } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post("/login", async (req, res) => {
  const { email, pass } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const passOk = bcrypt.compareSync(pass, user.pass);
    if (passOk) {
      const token = jwt.sign({ email: user.email, id: user._id }, jwtSecret);
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }).json({ name: user.name, email: user.email });
    } else {
      res.status(422).json({ error: 'Invalid password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post("/logout", (req, res) => {
  res.cookie('token', '', { 
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    expires: new Date(0)
  }).json({ message: 'Logged out successfully' });
});

app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-pass');
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post("/place", authenticateToken, async (req, res) => {
  const { title, address, photos, desc, checkin, checkout, maxguest, price } = req.body;
  try {
    const newPlace = new Places({
      owner: req.user.id,
      title,
      address,
      photos,
      desc,
      checkin,
      checkout,
      maxGuests: maxguest,
      price
    });
    await newPlace.save();
    res.status(201).json(newPlace);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/allplaces', async (req, res) => {
  try {
    const places = await Places.find();
    res.json(places);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/place/:id', async (req, res) => {
  try {
    const place = await Places.findById(req.params.id);
    if (!place) {
      return res.status(404).json({ error: 'Place not found' });
    }
    res.json(place);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/userplaces', authenticateToken, async (req, res) => {
  try {
    const places = await Places.find({ owner: req.user.id });
    res.json(places);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/place/:id', authenticateToken, async (req, res) => {
  try {
    const place = await Places.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!place) {
      return res.status(404).json({ error: 'Place not found or you do not have permission to delete it' });
    }
    res.json({ message: 'Place deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post("/booking", authenticateToken, async(req, res) => {
  const { id, name, tele, checkin, checkout, guest, price, photos } = req.body;
  try {
    let booking = new Booking({
      userid: req.user.id,
      placeid: id,
      tele: tele,
      name: name,
      checkin: checkin,
      checkout: checkout,
      guests_no: guest,
      price: price,
      photos: photos,
    });
    await booking.save();
    res.status(200).json({ message: 'Booking created successfully', booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/userbookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ userid: req.user.id });
    res.json(bookings);
  } catch (error) {
    console.error('Error in /userbookings route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const photoMiddleware = multer({ dest: '/tmp' });
app.post('/upload', photoMiddleware.array('photos', 100), async (req, res) => {
  try {
    const uploadedFiles = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const url = await uploadToS3(file);
      uploadedFiles.push(url);
      fs.unlinkSync(file.path);
    }
    res.json(uploadedFiles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error uploading files' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});