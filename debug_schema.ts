import { conn } from './db';

async function test() {
    try {
        const [rows] = await conn.query('DESCRIBE dormitories');
        console.log("Dormitories Schema:");
        console.table(rows);

        const [userCols] = await conn.query('DESCRIBE users');
        console.log("Users Schema:");
        console.table(userCols);

        const [dorm2] = await conn.query('SELECT owner_id FROM dormitories WHERE id = 2');
        console.log("Dorm 2 owner_id:", dorm2);
        if ((dorm2 as any).length > 0) {
            console.log("Type of owner_id:", typeof (dorm2 as any)[0].owner_id);
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
test();
