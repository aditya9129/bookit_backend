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
const allowedOrigins = [process.env.BASE_URL, 'http://localhost:5173'];
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
const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';
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
async function uploadToS3(filePath, originalFilename, mimetype) {
  const client = new S3Client({
    region: 'eu-north-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });

  const parts = originalFilename.split('.');
  const ext = parts[parts.length - 1];
  const newFilename = `${Date.now()}.${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Body: fs.readFileSync(filePath),
    Key: newFilename,
    ContentType: mimetype,
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
      secure: process.env.NODE_ENV === 'production',
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
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        domain: process.env.NODE_ENV === 'production' ? process.env.HOST_URL : 'localhost',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }).json({ name: user.name, email: user.email });
      console.log('Login successful. Cookie set:', res.getHeader('Set-Cookie'));
    } else {
      res.status(422).json({ error: 'Invalid password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// app.post("/login", async (req, res) => {
//   const { email, pass } = req.body;
//   try {
//     const user = await User.findOne({ email });
//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }
//     const passOk = bcrypt.compareSync(pass, user.pass);
//     if (passOk) {
//       const token = jwt.sign({ email: user.email, id: user._id }, jwtSecret);
//       res.cookie('token', token, {
//         httpOnly: true,
//         secure: process.env.NODE_ENV === 'production',
//         sameSite: 'none',
//         maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
//       }).json({ name: user.name, email: user.email });
//     } else {
//       res.status(422).json({ error: 'Invalid password' });
//     }
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// app.post("/logout", (req, res) => {
//   res.clearCookie('token', { 
//     httpOnly: true,
//     secure: process.env.NODE_ENV === 'production',
//     sameSite: 'none'
//   }).json({ message: 'Logged out successfully' });
// });

app.post("/logout", (req, res) => {
  res.cookie('token', '', { 
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    domain: process.env.NODE_ENV === 'production' ? '.your-domain.com' : 'localhost',
    path: '/',
    expires: new Date(0) // This will immediately expire the cookie
  }).json({ message: 'Logged out successfully' });
  
  console.log('Logout successful. Cookie cleared.');
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
app.post("/booking", async(req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { User,id,name,tele,checkin,checkout,
    guest,price ,photos} = req.body;
  
    let p=new Booking({
      userid:User._id,
      placeid:id,
      tele:tele,
      name:name,
      checkin: checkin,
      checkout: checkout,
      guests_no: guest,
      price:price,
      photos:photos,

    } )
    try{
      await p.save();
      res.status(200).json('ok');
    }catch{
      res.status(422).json('not ok');
    }
});
app.get('/userbookings', async (req, res) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    console.log('Received token:', token);

    jwt.verify(token, jwtSecret, async (err, decodedToken) => {
      if (err) {
        console.error('Token verification failed:', err);
        return res.status(401).json({ error: 'Invalid token' });
      }

      console.log('Decoded token:', decodedToken);

      // Your existing logic to fetch bookings
      const bookings = await Booking.find({ userid: decodedToken.id });
      res.json(bookings);
    });
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
      const { path, originalname, mimetype } = req.files[i];
      const url = await uploadToS3(path, originalname, mimetype);
      uploadedFiles.push(url);
      fs.unlinkSync(path);
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