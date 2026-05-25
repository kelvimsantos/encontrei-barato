
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Config multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Conectar MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas'))
  .catch(err => console.error('❌ Erro ao conectar:', err));

// Models
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  affiliateLink: { type: String, required: true },
  images: [{ type: String }],
  model3dUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

// Auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Autenticação necessária' });
  }
};

// ROTAS
app.post('/api/setup', async (req, res) => {
  try {
    const existing = await User.findOne({ email: 'admin@shoppe.com' });
    if (!existing) {
      const hashed = await bcrypt.hash('admin123', 10);
      await User.create({ email: 'admin@shoppe.com', password: hashed });
      res.json({ message: 'Admin criado: admin@shoppe.com / admin123' });
    } else {
      res.json({ message: 'Admin já existe' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category, search } = req.query;
    let filter = {};
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', auth, upload.array('images', 5), async (req, res) => {
  try {
    const images = req.files.map(f => `/uploads/${f.filename}`);
    const product = new Product({ ...req.body, images });
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', auth, upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    if (req.files && req.files.length > 0) {
      req.body.images = req.files.map(f => `/uploads/${f.filename}`);
    }
    Object.assign(product, req.body);
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories', (req, res) => {
  const categories = [
    { id: 'eletronicos', name: 'Eletrônicos', color: '#00b4d8', icon: '📱', bgColor: 'rgba(0, 180, 216, 0.1)' },
    { id: 'decoracao', name: 'Decoração', color: '#ff6b6b', icon: '🖼️', bgColor: 'rgba(255, 107, 107, 0.1)' },
    { id: 'relogios', name: 'Relógios', color: '#ffd93d', icon: '⌚', bgColor: 'rgba(255, 217, 61, 0.1)' },
    { id: 'tenis', name: 'Tênis', color: '#6c63ff', icon: '👟', bgColor: 'rgba(108, 99, 255, 0.1)' },
    { id: 'roupas', name: 'Roupas', color: '#ff6b9d', icon: '👕', bgColor: 'rgba(255, 107, 157, 0.1)' },
    { id: 'quarto', name: 'Quarto', color: '#a8e6cf', icon: '🛏️', bgColor: 'rgba(168, 230, 207, 0.1)' },
    { id: 'cozinha', name: 'Cozinha', color: '#ff8c42', icon: '🍳', bgColor: 'rgba(255, 140, 66, 0.1)' },
    { id: 'sala', name: 'Sala', color: '#ff4757', icon: '🛋️', bgColor: 'rgba(255, 71, 87, 0.1)' },
    { id: 'banheiro', name: 'Banheiro', color: '#4d908e', icon: '🚿', bgColor: 'rgba(77, 144, 142, 0.1)' },
    { id: 'area-externa', name: 'Área Externa', color: '#70e000', icon: '🌳', bgColor: 'rgba(112, 224, 0, 0.1)' },
    { id: 'beleza', name: 'Beleza', color: '#ff85a1', icon: '💄', bgColor: 'rgba(255, 133, 161, 0.1)' },
    { id: 'saude', name: 'Saúde', color: '#00c49a', icon: '💊', bgColor: 'rgba(0, 196, 154, 0.1)' }
  ];
  res.json(categories);
});

// Servir o frontend React
app.use(express.static(path.join(__dirname, '../client/build')));

// Rota para o frontend (TEM QUE SER A ÚLTIMA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`📦 API: http://localhost:${PORT}/api/categories`);
});
