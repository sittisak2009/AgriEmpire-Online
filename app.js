// ⚠️ นำ URL ของ SheetDB มาวางแทนที่ตรงนี้
const API_URL = "https://sheetdb.io/api/v1/my2ssyufztwjb"; 
let currentUser = null;

// 1. ระบบเข้าสู่ระบบ
async function handleLogin() {
    const usernameInput = document.getElementById('auth-username').value.trim();
    const passwordInput = document.getElementById('auth-password').value.trim();

    if (!usernameInput || !passwordInput) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/search?Username=${encodeURIComponent(usernameInput)}&Password=${encodeURIComponent(passwordInput)}`);
        const data = await res.json();

        if (data.length > 0) {
            currentUser = data[0];
            const now = new Date().toLocaleString('th-TH');
            
            // อัปเดตเวลาเข้าล็อกอินล่าสุดลงใน Sheet
            await fetch(`${API_URL}/User ID/${currentUser["User ID"]}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    data: { "Last Login Time": now } 
                })
            });

            currentUser["Last Login Time"] = now;
            loadGameUI();
        } else {
            alert('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อกับ SheetDB');
    }
}

// 2. ระบบลงทะเบียน (Auto User ID เริ่มที่ 10000001)
async function handleRegister() {
    const usernameInput = document.getElementById('auth-username').value.trim();
    const passwordInput = document.getElementById('auth-password').value.trim();

    if (!usernameInput || !passwordInput) {
        alert('กรุณากรอก Username และ Password');
        return;
    }

    try {
        const res = await fetch(API_URL);
        const allUsers = await res.json();
        
        let newId = 10000001;
        if (allUsers.length > 0) {
            const maxId = Math.max(...allUsers.map(u => parseInt(u["User ID"]) || 10000000));
            newId = maxId + 1;
        }

        const newUser = {
            "User ID": newId.toString(),
            "Username": usernameInput,
            "Password": passwordInput,
            "Last Login Time": new Date().toLocaleString('th-TH'),
            "Display Name": usernameInput
        };

        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [newUser] })
        });

        alert('ลงทะเบียนสำเร็จ! สามารถกดเข้าสู่ระบบได้เลย');
    } catch (err) {
        alert('เกิดข้อผิดพลาดในการลงทะเบียน');
    }
}

// 3. แสดงหน้าต่างเกมและข้อมูลผู้เล่น
function loadGameUI() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('nav-bar').classList.remove('hidden');

    document.getElementById('prof-id').innerText = currentUser["User ID"];
    document.getElementById('prof-name').innerText = currentUser["Display Name"];
    document.getElementById('prof-last-login').innerText = currentUser["Last Login Time"];
}

// 4. ระบบอัปเดตชื่อโปรไฟล์
async function updateProfile() {
    const newName = document.getElementById('new-display-name').value.trim();
    if (!newName) {
        alert('กรุณาใส่ชื่อที่ต้องการเปลี่ยน');
        return;
    }

    try {
        await fetch(`${API_URL}/User ID/${currentUser["User ID"]}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                data: { "Display Name": newName } 
            })
        });

        currentUser["Display Name"] = newName;
        document.getElementById('prof-name').innerText = newName;
        document.getElementById('new-display-name').value = '';
        alert('เปลี่ยนชื่อเรียบร้อยแล้ว!');
    } catch (err) {
        alert('อัปเดตชื่อไม่สำเร็จ');
    }
}

// 5. สลับหน้าต่าง UI (Bottom Navigation)
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.navbar button').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`nav-${tabName}`).classList.add('active');
}

// 6. ระบบเริ่มส่งออกพืชผล
function startExport() {
    const temp = document.getElementById('temp-control').value;
    alert(`กำลังเริ่มการส่งออกสินค้าที่อุณหภูมิ ${temp}°C`);
}

// 7. ออกจากระบบ
function logout() {
    currentUser = null;
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('nav-bar').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
}
  
