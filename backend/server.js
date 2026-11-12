const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 5000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json());

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function makeId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    token: user.token
  };
}

function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  const db = readDb();
  return db.users.find((user) => user.token === token) || null;
}

function getTrackingSnapshot(order) {
  const stages = [
    {
      key: 'ORDER_RECEIVED',
      label: 'Order Received',
      progress: 15,
      locationText: 'QuickWash Laundry Center',
      coords: { lat: 13.0827, lng: 80.2707 }
    },
    {
      key: 'PICKUP_CONFIRMED',
      label: 'Pickup Confirmed',
      progress: 30,
      locationText: 'Pickup Team Assigned',
      coords: { lat: 13.0845, lng: 80.2751 }
    },
    {
      key: 'WASHING',
      label: 'Washing in Progress',
      progress: 50,
      locationText: 'Washing Unit',
      coords: { lat: 13.0862, lng: 80.2789 }
    },
    {
      key: 'IRONING',
      label: 'Ironing / Finishing',
      progress: 70,
      locationText: 'Finishing Section',
      coords: { lat: 13.0876, lng: 80.2814 }
    },
    {
      key: 'OUT_FOR_DELIVERY',
      label: 'Out For Delivery',
      progress: 88,
      locationText: 'Delivery vehicle is on the way',
      coords: { lat: 13.0902, lng: 80.2873 }
    },
    {
      key: 'NEAR_CUSTOMER',
      label: 'Near Customer Location',
      progress: 96,
      locationText: order.address || 'Near your address',
      coords: { lat: 13.0911, lng: 80.2919 }
    },
    {
      key: 'DELIVERED',
      label: 'Ready for Handover / Delivered',
      progress: 100,
      locationText: order.address || 'Delivered to customer',
      coords: { lat: 13.0918, lng: 80.2941 }
    }
  ];

  const created = new Date(order.createdAt).getTime();
  const now = Date.now();
  const elapsedMinutes = Math.max(0, Math.floor((now - created) / 60000));
  const stageIndex = Math.min(Math.floor(elapsedMinutes / 1), stages.length - 1);
  const stage = stages[stageIndex];

  return {
    ...stage,
    isReady: stage.key === 'DELIVERED',
    stageIndex,
    stages
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'QuickWash backend running' });
});

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  const db = readDb();
  const exists = db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());

  if (exists) {
    return res.status(409).json({ message: 'Email already registered.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const user = {
    id: makeId('USR'),
    name,
    email,
    password,
    token,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  writeDb(db);

  res.status(201).json({ message: 'Signup successful.', user: sanitizeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDb();

  const user = db.users.find(
    (item) => item.email.toLowerCase() === String(email).toLowerCase() && item.password === password
  );

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  user.token = crypto.randomBytes(24).toString('hex');
  writeDb(db);

  res.json({ message: 'Login successful.', user: sanitizeUser(user) });
});

app.get('/api/auth/me', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  res.json({ user: sanitizeUser(user) });
});

app.get('/api/services', (req, res) => {
  const db = readDb();
  res.json({ services: db.services });
});

app.post('/api/orders/checkout', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { cart, address, pickupDate, paymentMethod } = req.body;

  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ message: 'Cart is empty.' });
  }

  if (!address || !pickupDate || !paymentMethod) {
    return res.status(400).json({ message: 'Address, pickup date and payment method are required.' });
  }

  const totalAmount = cart.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const order = {
    id: `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`,
    userId: user.id,
    customer: user.name,
    email: user.email,
    items: cart,
    address,
    pickupDate,
    paymentMethod,
    totalAmount,
    createdAt: new Date().toISOString()
  };

  const db = readDb();
  db.orders.unshift(order);
  writeDb(db);

  res.status(201).json({
    message: 'Order placed successfully.',
    order: {
      ...order,
      tracking: getTrackingSnapshot(order)
    }
  });
});

app.get('/api/orders/my', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const db = readDb();
  const orders = db.orders
    .filter((order) => order.userId === user.id)
    .map((order) => ({ ...order, tracking: getTrackingSnapshot(order) }));

  res.json({ orders });
});

app.get('/api/orders/search', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const customer = String(req.query.customer || '').trim().toLowerCase();
  const db = readDb();

  const orders = db.orders
    .filter((order) => {
      const sameUser = order.userId === user.id;
      const sameCustomer = !customer || order.customer.toLowerCase().includes(customer);
      return sameUser && sameCustomer;
    })
    .map((order) => ({ ...order, tracking: getTrackingSnapshot(order) }));

  res.json({ orders });
});

app.get('/api/orders/:id', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const db = readDb();
  const order = db.orders.find((item) => item.id === req.params.id && item.userId === user.id);

  if (!order) {
    return res.status(404).json({ message: 'Order not found.' });
  }

  res.json({ order: { ...order, tracking: getTrackingSnapshot(order) } });
});

app.listen(PORT, () => {
  console.log(`QuickWash backend running on http://localhost:${PORT}`);
});
