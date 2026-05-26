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
app.use(express.urlencoded({ extended: true }));

// ========== CRIAÇÃO DE PASTAS ==========
const DATA_DIR = path.join(__dirname, 'data');

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Pasta criada: ${DATA_DIR}`);
  }
}
ensureDirectories();

// ========== CONFIG CLOUDINARY ==========
const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary configurado');
} else {
  console.log('⚠️ Cloudinary não configurado');
}

// ========== CONFIG MULTER - MEMORY STORAGE (FUNCIONA NO RENDER) ==========
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Apenas imagens são permitidas (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ========== CONEXÃO MONGODB ==========
let usandoMongo = false;

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado ao MongoDB Atlas');
    usandoMongo = true;
  })
  .catch(err => {
    console.log('⚠️ MongoDB não conectou:', err.message);
    usandoMongo = false;
  });
} else {
  console.log('⚠️ MONGODB_URI não definida');
}

// ========== SCHEMAS ==========
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  affiliateLink: { type: String, required: true },
  images: [{ type: String }],
  model3dUrl: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);

// ========== SISTEMA DE FALLBACK JSON ==========
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [{
    _id: "admin123",
    email: "admin@shoppe.com",
    password: bcrypt.hashSync('admin123', 10),
    createdAt: new Date().toISOString()
  }];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2));
}

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

// ========== FUNÇÕES CRUD ==========
async function findUserByEmail(email) {
  if (usandoMongo) {
    return await User.findOne({ email });
  }
  return getUsers().find(u => u.email === email);
}

async function createUser(email, hashedPassword) {
  if (usandoMongo) {
    const user = new User({ email, password: hashedPassword });
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
    let query = {};
    if (category) query.category = category;
    if (search) query.name = { $regex: search, $options: 'i' };
    return await Product.find(query).sort({ createdAt: -1 });
  }
  
  let products = getProducts();
  if (category) products = products.filter(p => p.category === category);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  return products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getProductById(id) {
  if (usandoMongo && mongoose.Types.ObjectId.isValid(id)) {
    return await Product.findById(id);
  }
  return getProducts().find(p => p._id === id);
}

async function createProduct(productData, images) {
  const newProduct = {
    name: productData.name,
    category: productData.category,
    description: productData.description,
    affiliateLink: productData.affiliateLink,
    model3dUrl: productData.model3dUrl || '',
    images: images || [],
    createdAt: new Date()
  };
  
  if (usandoMongo) {
    const product = new Product(newProduct);
    await product.save();
    return product;
  }
  
  const products = getProducts();
  const productWithId = { ...newProduct, _id: Date.now().toString() };
  products.push(productWithId);
  saveProducts(products);
  return productWithId;
}

async function updateProduct(id, productData, images) {
  if (usandoMongo && mongoose.Types.ObjectId.isValid(id)) {
    const product = await Product.findById(id);
    if (!product) return null;
    
    if (productData.name) product.name = productData.name;
    if (productData.category) product.category = productData.category;
    if (productData.description) product.description = productData.description;
    if (productData.affiliateLink) product.affiliateLink = productData.affiliateLink;
    if (productData.model3dUrl !== undefined) product.model3dUrl = productData.model3dUrl;
    if (images && images.length) product.images = images;
    
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
  if (usandoMongo && mongoose.Types.ObjectId.isValid(id)) {
    await Product.findByIdAndDelete(id);
  } else {
    saveProducts(getProducts().filter(p => p._id !== id));
  }
}

// ========== FUNÇÃO DE UPLOAD CLOUDINARY (MEMORY STORAGE) ==========
async function uploadToCloudinary(fileBuffer, mimetype) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'shoppe_affiliate/products',
        transformation: [{ width: 800, height: 800, crop: 'limit' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

// ========== ROTAS API ==========

app.get('/api/status', (req, res) => {
  res.json({
    usandoMongo,
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME
  });
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'secretkey',
      { expiresIn: '7d' }
    );
    
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

// ========== POST - CRIAR PRODUTO ==========
app.post('/api/products', upload.array('images', 5), async (req, res) => {
  try {
    console.log(`📦 Criando produto: ${req.body.name}`);
    
    const images = [];
    
    if (req.files && req.files.length > 0 && process.env.CLOUDINARY_CLOUD_NAME) {
      for (const file of req.files) {
        try {
          const result = await uploadToCloudinary(file.buffer, file.mimetype);
          images.push(result.secure_url);
          console.log(`✅ Imagem enviada: ${result.secure_url}`);
        } catch (uploadErr) {
          console.error('❌ Erro upload:', uploadErr.message);
        }
      }
    }
    
    const product = await createProduct(req.body, images);
    res.status(201).json(product);
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== PUT - ATUALIZAR PRODUTO ==========
app.put('/api/products/:id', upload.array('images', 5), async (req, res) => {
  try {
    console.log(`🔄 Atualizando produto: ${req.params.id}`);
    
    let images = null;
    
    if (req.files && req.files.length > 0 && process.env.CLOUDINARY_CLOUD_NAME) {
      images = [];
      for (const file of req.files) {
        try {
          const result = await uploadToCloudinary(file.buffer, file.mimetype);
          images.push(result.secure_url);
          console.log(`✅ Imagem enviada: ${result.secure_url}`);
        } catch (uploadErr) {
          console.error('❌ Erro upload:', uploadErr.message);
        }
      }
    }
    
    const product = await updateProduct(req.params.id, req.body, images);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    
    res.json(product);
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
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
    { id: 'eletronicos', name: 'Eletrônicos', color: '#00b4d8', icon: '📱' },
    { id: 'decoracao', name: 'Decoração', color: '#ff6b6b', icon: '🖼️' },
    { id: 'relogios', name: 'Relógios', color: '#ffd93d', icon: '⌚' },
    { id: 'tenis', name: 'Tênis', color: '#6c63ff', icon: '👟' },
    { id: 'roupas', name: 'Roupas', color: '#ff6b9d', icon: '👕' }
  ];
  res.json(categories);
});

// ========== SETUP ==========
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
      <p>MongoDB: <strong>${usandoMongo ? '✅ Conectado' : '⚠️ Fallback JSON'}</strong></p>
      <p>Cloudinary: <strong>${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Ativo' : '❌ Inativo'}</strong></p>
      <a href="/admin">Ir para o Admin</a>
      </body></html>
    `);
  } catch (err) {
    res.send('❌ Erro: ' + err.message);
  }
});

// ========== SERVIR FRONTEND ==========
const BUILD_PATH = path.join(__dirname, '../client/build');
if (fs.existsSync(BUILD_PATH)) {
  app.use(express.static(BUILD_PATH));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(BUILD_PATH, 'index.html'));
    }
  });
} else {
  app.get('/', (req, res) => {
    res.send(`<h1>API Online</h1><p>MongoDB: ${usandoMongo ? '✅' : '❌'}</p><a href="/setup">Setup</a>`);
  });
}

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`💾 MongoDB: ${usandoMongo ? '✅ Conectado' : '❌ Fallback JSON'}`);
  console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Ativo' : '❌ Inativo'}\n`);
});