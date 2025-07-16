import express from "express";
import {Router} from "./routes/routes.js"
import dotenv from "dotenv";
dotenv.config();



const app=express();
app.use(express.urlencoded({extended:true}));


app.use("/",Router);

const PORT= process.env.PORT;

app.listen(PORT, async()=>{
    try{
        console.log(`server started on ${PORT}`)
    }catch(err){
        console.log("server failed to run...",err)
    }
})


