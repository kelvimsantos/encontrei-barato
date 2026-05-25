const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// ========== SISTEMA DE FALLBACK JSON ==========
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Arquivos JSON
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

// Inicializar arquivos JSON se não existirem
if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [{
    _id: "admin123",
    email: "admin@shoppe.com",
    password: bcrypt.hashSync('admin123', 10),
    createdAt: new Date()
  }];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  console.log('✅ users.json criado com admin');
}

if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2));
  console.log('✅ products.json criado');
}

// Funções para JSON
function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getProducts() {
  try {
    return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

// ========== TENTAR CONECTAR MONGODB ==========
let usandoMongo = false;

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
})
.then(() => {
  console.log('✅ Conectado ao MongoDB Atlas - Usando Banco de Dados');
  usandoMongo = true;
})
.catch(err => {
  console.log('⚠️ MongoDB não conectou, usando JSON como fallback');
  console.log('   Erro:', err.message);
  usandoMongo = false;
});

// ========== MODELS (para MongoDB) ==========
const UserSchema = new mongoose.Schema({
  email: String,
  password: String
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
  name: String,
  category: String,
  description: String,
  affiliateLink: String,
  images: [String],
  model3dUrl: String,
  createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

// ========== FUNÇÕES DE CRUD (Mongo ou JSON) ==========
async function findUserByEmail(email) {
  if (usandoMongo) {
    return await User.findOne({ email });
  } else {
    const users = getUsers();
    return users.find(u => u.email === email);
  }
}

async function createUser(email, hashedPassword) {
  if (usandoMongo) {
    const user = new User({ email, password: hashedPassword });
    await user.save();
    return user;
  } else {
    const users = getUsers();
    const newUser = {
      _id: Date.now().toString(),
      email,
      password: hashedPassword,
      createdAt: new Date()
    };
    users.push(newUser);
    saveUsers(users);
    return newUser;
  }
}

async function deleteUserByEmail(email) {
  if (usandoMongo) {
    await User.deleteOne({ email });
  } else {
    const users = getUsers();
    const filtered = users.filter(u => u.email !== email);
    saveUsers(filtered);
  }
}

async function getProductsList(category, search) {
  if (usandoMongo) {
    let filter = {};
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };
    return await Product.find(filter).sort({ createdAt: -1 });
  } else {
    let products = getProducts();
    if (category) products = products.filter(p => p.category === category);
    if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

async function getProductById(id) {
  if (usandoMongo) {
    return await Product.findById(id);
  } else {
    const products = getProducts();
    return products.find(p => p._id === id);
  }
}

async function createProduct(productData, images) {
  const newProduct = {
    _id: Date.now().toString(),
    ...productData,
    images: images || [],
    createdAt: new Date()
  };
  
  if (usandoMongo) {
    const product = new Product(newProduct);
    await product.save();
    return product;
  } else {
    const products = getProducts();
    products.push(newProduct);
    saveProducts(products);
    return newProduct;
  }
}

async function updateProduct(id, productData, images) {
  if (usandoMongo) {
    const product = await Product.findById(id);
    if (!product) return null;
    if (images) productData.images = images;
    Object.assign(product, productData);
    await product.save();
    return product;
  } else {
    const products = getProducts();
    const index = products.findIndex(p => p._id === id);
    if (index === -1) return null;
    if (images) productData.images = images;
    products[index] = { ...products[index], ...productData };
    saveProducts(products);
    return products[index];
  }
}

async function deleteProduct(id) {
  if (usandoMongo) {
    await Product.findByIdAndDelete(id);
  } else {
    const products = getProducts();
    const filtered = products.filter(p => p._id !== id);
    saveProducts(filtered);
  }
}

// ========== ROTA DE SETUP ==========
app.get('/setup', async (req, res) => {
  try {
    await deleteUserByEmail('admin@shoppe.com');
    const hashed = bcrypt.hashSync('admin123', 10);
    await createUser('admin@shoppe.com', hashed);
    res.send(`✅ Admin criado!<br>Email: admin@shoppe.com<br>Senha: admin123<br>Banco: ${usandoMongo ? 'MongoDB' : 'JSON'}<br><br><a href="/admin">Ir para o Admin</a>`);
  } catch (err) {
    res.send('❌ Erro: ' + err.message);
  }
});

// ========== ROTAS DA API ==========
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
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
    const products = await getProductsList(category, search);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', upload.array('images', 5), async (req, res) => {
  try {
    const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const product = await createProduct(req.body, images);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', upload.array('images', 5), async (req, res) => {
  try {
    const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : null;
    const product = await updateProduct(req.params.id, req.body, images);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    res.json({ message: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categorias
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

// Servir frontend
app.use(express.static(path.join(__dirname, '../client/build')));

// Rota para frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`💾 Banco: ${usandoMongo ? 'MongoDB Atlas' : 'JSON (fallback)'}`);
});