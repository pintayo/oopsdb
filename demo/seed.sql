-- OopsDB Demo Database
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    vip_status BOOLEAN DEFAULT 0
);

INSERT INTO users (name, email, vip_status) VALUES
('Alice', 'alice@example.com', 1),
('Bob', 'bob@example.com', 0),
('Charlie', 'charlie@example.com', 1);

CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount DECIMAL(10,2),
    status TEXT
);

INSERT INTO payments (user_id, amount, status) VALUES
(1, 99.00, 'success'),
(2, 19.99, 'pending');
