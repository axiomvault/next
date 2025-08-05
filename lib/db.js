// db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load .env file if it exists
dotenv.config();

export const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 10,
});