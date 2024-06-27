const mongoose = require("mongoose")
const {Schema}=mongoose;

const Userschema=new Schema({
    name:String,
    email:{
        type:String,
        unique:true,
    },
    pass:String
})
const Usermodel=mongoose.model('User',Userschema)
module.exports=Usermodel;