require('dotenv').config();
const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SHEETDB_URL = process.env.SHEETDB_URL;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// ระบบดึง/บันทึกข้อมูลผู้เล่นด้วย SheetDB
// ----------------------------------------------------
async function getOrInitPlayer(providerId, providerName, displayName) {
  try {
    const now = new Date().toLocaleString('th-TH');
    
    // 1. ค้นหาผู้เล่นเดิมด้วย Provider_ID
    const searchRes = await axios.get(`${SHEETDB_URL}/search?Provider_ID=${providerId}`);
    const existingPlayers = searchRes.data;

    if (existingPlayers && existingPlayers.length > 0) {
      // มีผู้เล่นเดิมอยู่แล้ว -> อัปเดตเวลาเข้าล็อกอินล่าสุด
      const player = existingPlayers[0];
      await axios.patch(`${SHEETDB_URL}/Provider_ID/${providerId}`, {
        data: { Last_Login: now }
      });

      return {
        providerId: player.Provider_ID,
        gameId: player.Game_ID,
        name: player.Display_Name,
        money: Number(player.Money) || 50000,
        revenue: Number(player.Total_Revenue) || 0
      };
    } else {
      // ผู้เล่นใหม่ -> ดึงข้อมูลทั้งหมดเพื่อคำนวณ Game_ID ล่าสุด (เริ่ม 10000001)
      const allRes = await axios.get(SHEETDB_URL);
      const allPlayers = allRes.data;

      let newGameId = 10000001;
      if (allPlayers && allPlayers.length > 0) {
        const validIds = allPlayers.map(p => Number(p.Game_ID)).filter(id => !isNaN(id));
        if (validIds.length > 0) {
          newGameId = Math.max(...validIds) + 1;
        }
      }

      const newPlayerData = {
        Provider_ID: providerId,
        Provider: providerName,
        Game_ID: newGameId,
        Display_Name: displayName,
        Last_Login: now,
        Money: 50000,
        Total_Revenue: 0
      };

      // บันทึกบรรทัดใหม่ลง Google Sheet ผ่าน SheetDB
      await axios.post(SHEETDB_URL, { data: [newPlayerData] });

      return {
        providerId: providerId,
        gameId: newGameId,
        name: displayName,
        money: 50000,
        revenue: 0
      };
    }
  } catch (error) {
    console.error('SheetDB Error:', error.message);
    return null;
  }
}

// ----------------------------------------------------
// Passport OAuth Configuration
// ----------------------------------------------------
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'DUMMY_ID',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'DUMMY_SECRET',
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    const player = await getOrInitPlayer(profile.id, 'Google', profile.displayName);
    return done(null, player);
  }
));

// Facebook Strategy
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID || 'DUMMY_ID',
    clientSecret: process.env.FACEBOOK_APP_SECRET || 'DUMMY_SECRET',
    callbackURL: "/auth/facebook/callback",
    profileFields: ['id', 'displayName']
  },
  async (accessToken, refreshToken, profile, done) => {
    const player = await getOrInitPlayer(profile.id, 'Facebook', profile.displayName);
    return done(null, player);
  }
));

// Auth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/game'));

app.get('/auth/facebook', passport.authenticate('facebook'));
app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/' }), (req, res) => res.redirect('/game'));

// Middleware ตรวจสอบการล็อกอิน
function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

// API ดึง และ เปลี่ยนชื่อโปรไฟล์
app.get('/api/me', checkAuth, (req, res) => res.json(req.user));

app.post('/api/update-name', checkAuth, async (req, res) => {
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'กรุณาระบุชื่อใหม่' });

  try {
    // อัปเดต Display_Name ใน SheetDB
    await axios.patch(`${SHEETDB_URL}/Provider_ID/${req.user.providerId}`, {
      data: { Display_Name: newName }
    });
    
    req.user.name = newName; // อัปเดตใน Session
    res.json({ success: true, name: newName });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถเปลี่ยนชื่อได้' });
  }
});

// ----------------------------------------------------
// Socket.io Real-time Systems
// ----------------------------------------------------
let onlinePlayers = {};

io.on('connection', (socket) => {
  socket.on('joinGame', (player) => {
    onlinePlayers[socket.id] = player;
    broadcastLeaderboard();
  });

  socket.on('disconnect', () => {
    delete onlinePlayers[socket.id];
    broadcastLeaderboard();
  });
});

async function broadcastLeaderboard() {
  try {
    const res = await axios.get(SHEETDB_URL);
    const players = res.data || [];
    
    // คำนวณ % รายได้รวม
    const totalMarketRevenue = players.reduce((sum, p) => sum + (Number(p.Total_Revenue) || 0), 0);

    const leaderboard = players.map(p => {
      const rev = Number(p.Total_Revenue) || 0;
      const share = totalMarketRevenue > 0 ? ((rev / totalMarketRevenue) * 100).toFixed(1) : 0;
      return {
        gameId: p.Game_ID,
        name: p.Display_Name,
        revenue: rev,
        sharePercent: share
      };
    }).sort((a, b) => b.revenue - a.revenue);

    io.emit('leaderboardUpdate', leaderboard);
  } catch (err) {
    console.error('Error fetching leaderboard:', err.message);
  }
}

// Serve Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/game', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
