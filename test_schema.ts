import { conn } from './db';

async function test() {
    try {
        const [rows] = await conn.query('DESCRIBE rooms');
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
test();
