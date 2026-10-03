const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware (ອະນຸຍາດໃຫ້ Google Sites ເຂົ້າເຖິງ API ໄດ້)
app.use(cors());
app.use(express.json());

// Initialize SQLite Database
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Database Error:', err.message);
    else console.log('Connected to SQLite Database.');
});

// Create Tables & Initial Data
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            coins INTEGER DEFAULT 100
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            platform TEXT,
            url TEXT,
            target INTEGER,
            current INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`INSERT OR IGNORE INTO users (id, username, coins) VALUES (1, 'google_sites_user', 500)`);
});

// Root Route ສຳລັບກວດສອບການເຮັດວຽກຂອງ Server
app.get('/', (req, res) => {
    res.send('API Server is running successfully!');
});

// API Endpoints
app.get('/api/user/:id', (req, res) => {
    db.get(`SELECT id, username, coins FROM users WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { id: 1, username: 'user', coins: 0 });
    });
});

app.post('/api/orders', (req, res) => {
    const { user_id, platform, url, target } = req.body;
    const cost = target * 2;

    if (!platform || !url || !target || target <= 0) {
        return res.status(400).json({ error: 'ຂໍ້ມູນອໍເດີບໍ່ຖືກຕ້ອງ' });
    }

    db.get(`SELECT coins FROM users WHERE id = ?`, [user_id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'ບໍ່ພົບຜູ້ໃຊ້ງານ' });
        if (user.coins < cost) return res.status(400).json({ error: 'Coins ຂອງທ່ານບໍ່ພໍ' });

        db.serialize(() => {
            db.run(`UPDATE users SET coins = coins - ? WHERE id = ?`, [cost, user_id]);
            db.run(
                `INSERT INTO orders (user_id, platform, url, target) VALUES (?, ?, ?, ?)`,
                [user_id, platform, url, target],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'ສ້າງອໍເດີສຳເລັດ', order_id: this.lastID });
                }
            );
        });
    });
});

app.get('/api/orders/:user_id', (req, res) => {
    db.all(
        `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
        [req.params.user_id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.post('/api/earn', (req, res) => {
    const { user_id, amount } = req.body;
    db.run(`UPDATE users SET coins = coins + ? WHERE id = ?`, [amount || 10, user_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'ຮັບ Coins ສຳເລັດ' });
    });
});

// Background Task Processor (Worker Engine)
setInterval(() => {
    db.all(`SELECT id, target, current FROM orders WHERE current < target`, [], (err, rows) => {
        if (err || !rows) return;
        rows.forEach(order => {
            const increment = Math.floor(Math.random() * 2) + 1;
            const newCurrent = Math.min(order.target, order.current + increment);
            const status = newCurrent >= order.target ? 'completed' : 'processing';
            db.run(`UPDATE orders SET current = ?, status = ? WHERE id = ?`, [newCurrent, status, order.id]);
        });
    });
}, 3000);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
