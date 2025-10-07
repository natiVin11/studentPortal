const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('../frontend'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads folder if not exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// --- Multiple DB Connections ---
const dbUsers = new sqlite3.Database('./users.sqlite');
const dbFaults = new sqlite3.Database('./faults.sqlite');
const dbCourses = new sqlite3.Database('./courses.sqlite');
const dbDrivers = new sqlite3.Database('./drivers.sqlite');
const dbMessages = new sqlite3.Database('./messages.sqlite');
const dbLocations = new sqlite3.Database('./locations.sqlite');

// --- Create Tables ---
dbUsers.serialize(() => {
    dbUsers.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`);
});

dbFaults.serialize(() => {
    dbFaults.run(`CREATE TABLE IF NOT EXISTS faults (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        issue TEXT,
        solution TEXT,
        media TEXT,
        approved INTEGER DEFAULT 0
    )`);
});

dbCourses.serialize(() => {
    dbCourses.run(`CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        department TEXT,
        content TEXT,
        file_url TEXT,
        media_url TEXT
    )`);
});

dbDrivers.serialize(() => {
    dbDrivers.run(`CREATE TABLE IF NOT EXISTS drivers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        name TEXT
    )`);
});

dbMessages.serialize(() => {
    dbMessages.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
});

dbLocations.serialize(() => {
    dbLocations.run(`CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department TEXT,
        title TEXT,
        image_url TEXT
    )`);
});

// --- Default Users ---
const defaultUsers = [
    { username: 'student', password: '123456', role: 'student' },
    { username: 'adminT', password: '123456', role: 'tech_admin' },
    { username: 'adminM', password: '123456', role: 'call_admin' },
    { username: 'adminA', password: '123456', role: 'app_admin' },
    { username: 'adminS', password: '123456', role: 'sys_admin' },
    { username: 'admin', password: '123456', role: 'student_admin' }
];
defaultUsers.forEach(u => {
    dbUsers.run(
        `INSERT OR IGNORE INTO users(username,password,role) VALUES(?,?,?)`,
        [u.username, u.password, u.role]
    );
});

// --- Multer setup ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ================= ROUTES =================

// --- Login ---
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    dbUsers.get(
        `SELECT * FROM users WHERE username=? AND password=?`,
        [username, password],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row) return res.json({ username: row.username, role: row.role });
            return res.status(401).json({ error: 'Invalid credentials' });
        }
    );
});

// --- Faults ---
app.post('/faults', upload.single('media'), (req, res) => {
    const { username, issue, solution } = req.body;
    let mediaPath = req.file ? `/uploads/${req.file.filename}` : null;
    dbFaults.run(
        `INSERT INTO faults (username,issue,solution,media) VALUES (?,?,?,?)`,
        [username, issue, solution, mediaPath],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/faults', (req, res) => {
    dbFaults.all(`SELECT * FROM faults WHERE approved=1 ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/faults/pending', (req, res) => {
    dbFaults.all(`SELECT * FROM faults WHERE approved=0`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/faults/approve/:id', (req, res) => {
    dbFaults.run(`UPDATE faults SET approved=1 WHERE id=?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

// --- Courses ---
// Upload course via file
app.post('/courses/file', upload.single('file'), (req, res) => {
    const { title, department } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const file_url = `/uploads/${req.file.filename}`;
    dbCourses.run(
        `INSERT INTO courses (title,department,file_url) VALUES (?,?,?)`,
        [title, department, file_url],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Upload course manually
app.post('/courses/manual', upload.single('file'), (req, res) => {
    const { title, department, content } = req.body;
    let media_url = req.file ? `/uploads/${req.file.filename}` : null;
    dbCourses.run(
        `INSERT INTO courses (title,department,content,media_url) VALUES (?,?,?,?)`,
        [title, department, content, media_url],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Fetch courses with role-based filter
app.post('/courses', (req, res) => {
    const { role } = req.body;

    let query = `SELECT * FROM courses`;
    let params = [];

    if (role === 'tech_admin') {
        query += ` WHERE department=?`;
        params.push('technicians');
    } else if (role === 'call_admin') {
        query += ` WHERE department=?`;
        params.push('callcenter');
    } else if (role === 'student') {
        // רואה הכל -> לא מוסיפים WHERE
    }

    dbCourses.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Drivers ---
app.post('/drivers', (req, res) => {
    const { date, name } = req.body;
    dbDrivers.run(`INSERT INTO drivers (date,name) VALUES (?,?)`, [date, name], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/drivers/:date', (req, res) => {
    dbDrivers.all(`SELECT * FROM drivers WHERE date=?`, [req.params.date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Messages ---
app.post('/messages', (req, res) => {
    const { title, content, created_by } = req.body;
    dbMessages.run(
        `INSERT INTO messages (title,content,created_by) VALUES (?,?,?)`,
        [title, content, created_by],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/messages', (req, res) => {
    dbMessages.all(`SELECT * FROM messages ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Locations ---
app.post('/locations', upload.single('image'), (req, res) => {
    const { department, title } = req.body;
    let image_url = req.file ? `/uploads/${req.file.filename}` : null;
    dbLocations.run(
        `INSERT INTO locations (department,title,image_url) VALUES (?,?,?)`,
        [department, title, image_url],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/locations/:department', (req, res) => {
    dbLocations.all(`SELECT * FROM locations WHERE department=?`, [req.params.department], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


// --- Add New User (Admin only) ---
app.post('/users/add', (req, res) => {
    const { adminUsername, username, password, role } = req.body;

    // בדיקה אם המשתמש המבצע הוא אדמין
    dbUsers.get(`SELECT * FROM users WHERE username=?`, [adminUsername], (err, admin) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!admin || !admin.role.includes('admin')) {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        // הוספת המשתמש החדש
        dbUsers.run(
            `INSERT INTO users(username,password,role) VALUES (?,?,?)`,
            [username, password, role],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID, username, role });
            }
        );
    });
});

app.listen(5000, () => console.log('Server running on port 5000'));
