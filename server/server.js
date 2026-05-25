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

// ========== CRIAÇÃO DE PASTAS ==========
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('📁 Pasta uploads criada');
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Pasta data criada');
}

// Servir arquivos estáticos
app.use('/uploads', express.static(UPLOADS_DIR));

// ========== CONFIG MULTER ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ========== SISTEMA DE FALLBACK JSON ==========
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

// Inicializar users.json
if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [{
    _id: "admin123",
    email: "admin@shoppe.com",
    password: bcrypt.hashSync('admin123', 10),
    createdAt: new Date().toISOString()
  }];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  console.log('✅ users.json criado com admin');
}

// Inicializar products.json
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2));
  console.log('✅ products.json criado');
}

// Funções JSON
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

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log('✅ Conectado ao MongoDB Atlas');
    usandoMongo = true;
  })
  .catch(err => {
    console.log('⚠️ MongoDB não conectou, usando JSON fallback');
    console.log('   Erro:', err.message);
    usandoMongo = false;
  });
} else {
  console.log('⚠️ MONGODB_URI não definida, usando JSON fallback');
}

// ========== MODELS (para MongoDB) ==========
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  createdAt: Date
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
  _id: String,
  name: String,
  category: String,
  description: String,
  affiliateLink: String,
  images: [String],
  model3dUrl: String,
  createdAt: Date
});
const Product = mongoose.model('Product', ProductSchema);

// ========== FUNÇÕES CRUD ==========
async function findUserByEmail(email) {
  if (usandoMongo) {
    return await User.findOne({ email });
  }
  return getUsers().find(u => u.email === email);
}

async function createUser(email, hashedPassword) {
  if (usandoMongo) {
    const user = new User({ email, password: hashedPassword, createdAt: new Date() });
    await user.save();
    return user;
  }
  const users = getUsers();
  const newUser = {
    _id: Date.now().toString(),
    email,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  return newUser;
}

async function deleteUserByEmail(email) {
  if (usandoMongo) {
    await User.deleteOne({ email });
  } else {
    const users = getUsers();
    saveUsers(users.filter(u => u.email !== email));
  }
}

async function getProductsList(category, search) {
  if (usandoMongo) {
    let filter = {};
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };
    return await Product.find(filter).sort({ createdAt: -1 });
  }
  let products = getProducts();
  if (category) products = products.filter(p => p.category === category);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getProductById(id) {
  if (usandoMongo) {
    return await Product.findById(id);
  }
  return getProducts().find(p => p._id === id);
}

async function createProduct(productData, images) {
  const newProduct = {
    _id: Date.now().toString(),
    name: productData.name,
    category: productData.category,
    description: productData.description,
    affiliateLink: productData.affiliateLink,
    model3dUrl: productData.model3dUrl || '',
    images: images || [],
    createdAt: new Date().toISOString()
  };
  
  if (usandoMongo) {
    const product = new Product(newProduct);
    await product.save();
    return product;
  }
  const products = getProducts();
  products.push(newProduct);
  saveProducts(products);
  return newProduct;
}

async function updateProduct(id, productData, images) {
  if (usandoMongo) {
    const product = await Product.findById(id);
    if (!product) return null;
    if (images && images.length) productData.images = images;
    Object.assign(product, productData);
    await product.save();
    return product;
  }
  const products = getProducts();
  const index = products.findIndex(p => p._id === id);
  if (index === -1) return null;
  if (images && images.length) productData.images = images;
  products[index] = { ...products[index], ...productData };
  saveProducts(products);
  return products[index];
}

async function deleteProduct(id) {
  if (usandoMongo) {
    await Product.findByIdAndDelete(id);
  } else {
    saveProducts(getProducts().filter(p => p._id !== id));
  }
}

// ========== ROTA DE SETUP ==========
app.get('/setup', async (req, res) => {
  try {
    await deleteUserByEmail('admin@shoppe.com');
    const hashed = bcrypt.hashSync('admin123', 10);
    await createUser('admin@shoppe.com', hashed);
    res.send(`
      <html><body style="font-family: Arial; text-align: center; padding: 50px;">
      <h1>✅ Admin Criado!</h1>
      <p>Email: <strong>admin@shoppe.com</strong></p>
      <p>Senha: <strong>admin123</strong></p>
      <p>Banco: <strong>${usandoMongo ? 'MongoDB Atlas' : 'JSON (local)'}</strong></p>
      <br>
      <a href="/admin" style="background: #00b4d8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir para o Admin</a>
      </body></html>
    `);
  } catch (err) {
    res.send('❌ Erro: ' + err.message);
  }
});

// ========== ROTAS API ==========
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secretkey');
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
    console.log('📦 Recebendo produto:', req.body);
    console.log('📸 Arquivos:', req.files ? req.files.length : 0);
    
    const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const product = await createProduct(req.body, images);
    res.json(product);
  } catch (err) {
    console.error('❌ Erro ao criar produto:', err);
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

// ========== CATEGORIAS ==========
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

// ========== SERVIR FRONTEND ==========
const BUILD_PATH = path.join(__dirname, '../client/build');
if (fs.existsSync(BUILD_PATH)) {
  app.use(express.static(BUILD_PATH));
  app.get('*', (req, res) => {
    res.sendFile(path.join(BUILD_PATH, 'index.html'));
  });
} else {
  console.log('⚠️ Pasta client/build não encontrada');
  app.get('/', (req, res) => {
    res.send('API funcionando! Frontend não construído ainda.');
  });
}

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`🔧 Setup: http://localhost:${PORT}/setup`);
  console.log(`💾 Modo: ${usandoMongo ? 'MongoDB Atlas' : 'JSON (fallback)'}`);
  console.log(`📁 Uploads: ${UPLOADS_DIR}`);
  console.log(`💾 Dados: ${DATA_DIR}\n`);
});