const mongoose=require('mongoose');
const BookingSchema=new mongoose.Schema({
    userid:String,
    placeid:String,
    name:String,
    tele:Number,
    photos:[String],
    checkin: String,
    checkout: String,
    guests_no: Number,
    price: Number,
})
const Bookingmodel=mongoose.model('Booking',BookingSchema);
module.exports=Bookingmodel;