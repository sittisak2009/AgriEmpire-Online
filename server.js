const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const axios = require('axios'); // ใช้ส่งข้อมูลหา SheetDB

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'fluke_darkwick_secret',
    resave: false,
    saveUninitialized: true
}));

const SHEETDB_URL = process.env.SHEETDB_URL;

// --- 1. ระบบสมัครสมาชิก (Register) ---
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        // เช็กว่ามีชื่อนี้ในระบบหรือยัง
        const checkUser = await axios.get(`${SHEETDB_URL}/search?username=${username}`);
        if (checkUser.data.length > 0) {
            return res.send("<script>alert('ชื่อนี้มีผู้ใช้งานแล้ว!'); window.location.href='/';</script>");
        }

        // บันทึก username และ password ลง SheetDB
        await axios.post(SHEETDB_URL, {
            data: [{ username: username, password: password }]
        });

        req.session.username = username;
        res.redirect('/game');
    } catch (error) {
        console.error(error);
        res.send("<script>alert('เกิดข้อผิดพลาดในการสมัครสมาชิก'); window.location.href='/';</script>");
    }
});

// --- 2. ระบบเข้าสู่ระบบ (Login) ---
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // ค้นหา username และ password ที่ตรงกันใน SheetDB
        const response = await axios.get(`${SHEETDB_URL}/search?username=${username}&password=${password}`);
        
        if (response.data.length > 0) {
            req.session.username = username; // ล็อกอินสำเร็จ
            res.redirect('/game');
        } else {
            res.send("<script>alert('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง!'); window.location.href='/';</script>");
        }
    } catch (error) {
        console.error(error);
        res.send("<script>alert('เกิดข้อผิดพลาดในการเข้าสู่ระบบ'); window.location.href='/';</script>");
    }
});

// --- 3. หน้าเกม & API ---
app.get('/game', (req, res) => {
    if (!req.session.username) return res.redirect('/');
    res.sendFile(__dirname + '/public/game.html');
});

app.get('/api/user', (req, res) => {
    res.json({ username: req.session.username || null });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
