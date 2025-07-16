import fs from "fs";
import path from "path";
import multer from "multer";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const pool = new Pool({
  user: process.env.UN,
  host: "localhost",
  database: process.env.DB,
  password: process.env.PWD,
  port: 5432,
});

export const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

export const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => {
    cb(null, Date.now().toString() + "-" + file.originalname);
  },
});


export const upload = multer({ storage });
