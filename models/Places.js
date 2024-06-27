const mongoose=require('mongoose');
const PlacesSchema=new mongoose.Schema({
    owner:String,
    title: String,
    address: String,
    photos: [String],
    desc: String,
    perks: [String],
    checkin: String,
    checkout: String,
    maxGuests: Number,
    price: Number,
})
const Placemodel=mongoose.model('Place',PlacesSchema);
module.exports=Placemodel;