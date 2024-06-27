const express = require('express');
const cors = require('cors');
const { default: mongoose } = require('mongoose');
const bcrypt=require('bcryptjs');
const app = express();
const User=require('./models/user')
const Places=require('./models/Places');
const Booking=require('./models/Booking');
const multer=require('multer');
const jwt=require('jsonwebtoken')
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fs = require('fs');
const mime = require('mime-types');
const {S3Client, PutObjectCommand}=require('@aws-sdk/client-s3')
const ObjectId = mongoose.Types.ObjectId;
const BASE_URL=process.env.BASE_URL;
require('dotenv').config();
app.use(cors({
  credentials: true,
  origin:`${BASE_URL}`,
}));
const bcryptSalt=bcrypt.genSaltSync(10);
const jwtsecret='dfdvbgfbgfbg';



const bucket = 'aditya9129-bucket'; 

async function uploadToS3(filePath, originalFilename, mimetype) {
  const client = new S3Client({
    region: 'eu-north-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    endpoint: `https://s3.amazonaws.com`
  });

  const parts = originalFilename.split('.');
  const ext = parts[parts.length - 1];
  const newFilename = `${Date.now()}.${ext}`;

  const data = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Body: fs.readFileSync(filePath),
    Key: newFilename,
    ContentType: mimetype,
    ACL: 'public-read',
  }));

  return `https://${bucket}.s3.amazonaws.com/${newFilename}`;
}








app.use(express.json()); // Add this line to parse JSON bodies
app.use(cookieParser());


app.post("/register", async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { name, email, pass } = req.body;
  try {
    let existingUser = await User.findOne({ email: email });
    if (existingUser) {
      res.status(422).json({ error: 'Email already exists' });
    } else {
      let user1 = new User({
        name: name,
        pass: bcrypt.hashSync(pass, bcrypt.genSaltSync(10)),
        email: email,
      });
      await user1.save();
      console.log(user1);
      res.status(200).json({ message: 'Registration successful' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post("/login", async(req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const {email, pass } = req.body;
  const user=await User.findOne({email});

  console.log(user);
  if(user){
    const passok=bcrypt.compareSync(pass,user.pass);
    if(passok){
      jwt.sign({email:user.email,id:user._id},jwtsecret,{},(err,token)=>{
        if(err) throw err;
        res.cookie('token',token).json(user);
      });
      
    }else{
      res.status(422).json('pass not ok')
    }
  }else{
    res.status(422).json('email not found')
  }

});
app.post("/logout", (req, res) => {
  res.cookie('token','').json('ok'); 
});
app.post("/place", async(req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  const { User,title,address,photos,
    desc,checkin,checkout,
    maxguest,price } = req.body;
  
    let p=new Places({
      owner:User._id,
      title:title,
      address:address,
      photos:photos,
      desc:desc,
      checkin:checkin,
      checkout:checkout,
      maxGuests:maxguest,
      price:price

    } )
    console.log(req.body);
    try{
      await p.save();
      res.status(200).json('ok');
    }catch{
      res.status(422).json('not ok');
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
   // console.log(req.body);
    try{
      await p.save();
      res.status(200).json('ok');
    }catch{
      res.status(422).json('not ok');
    }
});
app.get("/profile",(req,res)=>{
  mongoose.connect(process.env.MONGO_URL);
  const {token}=req.cookies;
 // console.log(res);
  if (token) {
    jwt.verify(token, jwtsecret, {}, async (err, userData) => {
      //console.log(userData);
      if (err) throw err;
      const {name,email,_id} = await User.findById(userData.id);
      res.json({name,email,_id});
    });
  } else {
    res.json(null);
  }
})
app.get('/allplaces',async(req,res)=>{
  mongoose.connect(process.env.MONGO_URL);
  const places = await Places.find();
  
  const {token}=req.cookies;
  if (token) {
    
    jwt.verify(token, jwtsecret, {}, async (err, userData) => {
      res.json(places);
    });
  } else {
    res.json(null);
  }
  
})
app.get('/place/:id',async(req,res)=>{
  mongoose.connect(process.env.MONGO_URL);
  const place = await Places.findById(req.params.id);
  console.log(place)
  res.json(place);
})
app.get('/userplaces',async (req,res)=>{
  mongoose.connect(process.env.MONGO_URL);
  const {token}=req.cookies;
  console.log(res);
   if (token) {
    
     jwt.verify(token, jwtsecret, {}, async (err, userData) => {
       console.log(userData);
       if (err) throw err;
       const places = await Places.find({owner:userData.id})
       res.json(places);
     });
   } else {
     res.json(null);
   }
  
})
app.get('/userbookings',async (req,res)=>{
  mongoose.connect(process.env.MONGO_URL);
  const {token}=req.cookies;
  // console.log(res);
   if (token) {
    
     jwt.verify(token, jwtsecret, {}, async (err, userData) => {
       console.log(userData);
       if (err) throw err;
       const bookings = await Booking.find({userid:userData.id})
       res.json(bookings);
     });
   } else {
     res.json(null);
   }
  
})
app.delete('/place/:id', async (req, res) => {
  try {
    const place = await Places.findByIdAndDelete(req.params.id);

    if (!place) {
      return res.status(404).json({ error: 'Place not found' });
    }

    res.json({ message: 'Place deleted successfully' });
  } catch (error) {
    console.error('Error deleting place:', error);
    res.status(500).json({ error: 'Error deleting place' });
  }
});
const photosmiddleware=multer({dest:'/tmp'})
app.post('/upload',photosmiddleware.array('photos',100), async (req, res) => {
  mongoose.connect(process.env.MONGO_URL);
  console.log(req.body)
  const uploadedFiles = [];
  for (let i = 0; i < req.files.length; i++) {
    const { path, originalname,mimetype } = req.files[i];
   const url= await uploadToS3(path,originalname,mimetype);
   uploadedFiles.push(url);
  }
  res.json(uploadedFiles);
});









const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});







 













