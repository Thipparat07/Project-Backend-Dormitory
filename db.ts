import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const conn = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
});

// เช็คการเชื่อมต่อ
(async () => {
  try {
    const connection = await conn.getConnection();
    await connection.ping();
    console.log('Database connected successfully.');
    connection.release(); // คืน connection กลับไปที่ pool
  } catch (error) {
    console.error('Failed to connect to the database:', error);
  }
})();