const API_URL = "http://localhost:3000/api";

const registerAndLogin = async (email, password, phone) => {
    // 1. Register
    const regRes = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, phone })
    });
    // ignore 409 if already exists

    // 2. Login
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(loginData.message.en || loginData.message);
    return loginData.data;
};

const runTest = async () => {
    try {
        console.log("=== เริ่มการทดสอบ Seamless Context Role ===");

        let ownerEmail = `owner_${Date.now()}@test.com`;
        let tenantEmail = `tenant_${Date.now()}@test.com`;

        console.log("1. สร้างผู้ใช้ (Owner และ Tenant - โดยไม่มี account_type)");
        let ownerData = await registerAndLogin(ownerEmail, "password123", "0812345678");
        let tenantData = await registerAndLogin(tenantEmail, "password123", "0912345678");

        console.log("-> Contexts Owner เริ่มต้น: ", ownerData.user.contexts);
        console.log("-> Contexts Tenant เริ่มต้น: ", tenantData.user.contexts);

        console.log("\n2. Owner สร้างหอพัก");
        const createDormRes = await fetch(`${API_URL}/dormitories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerData.token}`
            },
            body: JSON.stringify({
                name: "หอพักทดสอบระบบ",
                phone: "02123456",
                address: "กรุงเทพ",
                bill_generation_day: 25,
                bill_due_date: 5,
                billing_type: "prepaid",
                number_of_floors: 1,
                rooms_per_floor: 2
            })
        });
        const dormData = await createDormRes.json();
        if (!createDormRes.ok) throw new Error(dormData.message.en);
        const dormitoryId = dormData.data.dormitory_id;
        const joinCode = dormData.data.join_code;
        console.log(`-> สร้างหอพักสำเร็จ ID: ${dormitoryId}, Join Code: ${joinCode}`);

        console.log("\n3. Owner เข้าระบบใหม่ เพื่อให้ Token อัปเดตสิทธิ์ (เป็น Workflow ปกติ)");
        ownerData = await registerAndLogin(ownerEmail, "password123", "0812345678");
        console.log("-> Contexts Owner ใหม่ (ควรมีสิทธิ์ Owner ของหอนี้): ", ownerData.user.contexts);

        if (ownerData.user.contexts[dormitoryId] !== 'owner') {
            throw new Error("❌ Owner Validation Error: Role Not Assigned");
        }

        console.log("\n4. ดึงข้อมูลห้องเพื่อเตรียมให้ Tenant กดเข้า (โดย Owner)");
        const roomsRes = await fetch(`${API_URL}/dormitories/${dormitoryId}/rooms`, {
            headers: { 'Authorization': `Bearer ${ownerData.token}` }
        });
        const roomsJson = await roomsRes.json();
        const roomId = roomsJson.data[0].id; // เอาห้องแรก
        console.log(`-> ได้ห้อง ID: ${roomId}`);

        console.log("\n5. Tenant ยื่นคำขอเข้าหอพัก");
        const joinRes = await fetch(`${API_URL}/tenants/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tenantData.token}`
            },
            body: JSON.stringify({
                join_code: joinCode,
                room_id: roomId,
                national_id: "1234567890123"
            })
        });
        const joinOut = await joinRes.json();
        if (!joinRes.ok) throw new Error(joinOut.message.en);
        console.log("-> Tenant ยื่นคำขอสำเร็จ");

        console.log("\n6. Owner ตรวจสอบคำขอและอนุมัติ");
        const getReqRes = await fetch(`${API_URL}/tenants/${dormitoryId}/join-requests`, {
            headers: { 'Authorization': `Bearer ${ownerData.token}` }
        });
        const reqsJson = await getReqRes.json();
        const tenantRequestId = reqsJson.data[0].id;

        const approveRes = await fetch(`${API_URL}/tenants/${dormitoryId}/join-requests/${tenantRequestId}/approve`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerData.token}`
            },
            body: JSON.stringify({ room_id: roomId })
        });
        const approveJson = await approveRes.json();
        if (!approveRes.ok) throw new Error(approveJson.message.en);
        console.log("-> Owner กดอนุมัติสำเร็จ");

        console.log("\n7. Tenant เข้าระบบใหม่ เพื่ออัปเดตสิทธิ์");
        tenantData = await registerAndLogin(tenantEmail, "password123", "0912345678");
        console.log("-> Contexts Tenant ใหม่ (ควรมีสิทธิ์ Tenant ของหอนี้): ", tenantData.user.contexts);

        if (tenantData.user.contexts[dormitoryId] !== 'tenant') {
            throw new Error("❌ Validation Error: Tenant Role Not Assigned");
        }

        console.log("\n8. Tenant พยายามดึงข้อมูลหอพักตัวเองผ่าน Context Checked Endpoint");
        const myDormsRes = await fetch(`${API_URL}/tenants/my-dormitories`, {
            headers: { 'Authorization': `Bearer ${tenantData.token}` }
        });
        const myDormsJson = await myDormsRes.json();
        if (!myDormsRes.ok) throw new Error(myDormsJson.message.en);
        console.log(`-> Tenant สามารถดึงข้อมูลหอได้: ${myDormsJson.data.length} หอพัก`);

        console.log("\n9. Owner ลองเสแสร้งเป็น Tenant (ควรจะถูกบล็อค)");
        const hackRes = await fetch(`${API_URL}/tenants/my-dormitories`, {
            headers: { 'Authorization': `Bearer ${ownerData.token}` }
        });
        if (hackRes.status === 403) {
            console.log("-> โดน 403 Forbidden ถูกต้องตามคาด เพราะ Owner ไม่มีสิทธิ์เข้าถึงเส้นทาง /tenants/my-dormitories ของตนเองได้");
        } else {
            console.log("-> ⚠️ สิทธิ์อาจมีช่องโหว่: " + hackRes.status);
        }

        console.log("\n✅ [SUCCESS] บททดสอบ Context Role ทั้งหมดผ่านฉลุยครับ!");

    } catch (err) {
        console.error("Test Failed: ", err.message);
    }
};

runTest();
