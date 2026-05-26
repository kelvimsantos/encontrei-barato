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
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

function ensureDirectories() {
  const dirs = [UPLOADS_DIR, DATA_DIR];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Pasta criada: ${dir}`);
    }
  });
}
ensureDirectories();

// Servir arquivos estáticos
app.use('/uploads', express.static(UPLOADS_DIR));

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

// ========== CONFIG MULTER ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDirectories();
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
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

// ========== CONEXÃO MONGODB (OTIMIZADA) ==========
let usandoMongo = false;

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log('✅ Conectado ao MongoDB Atlas');
    usandoMongo = true;
    
    // Criar índices após conectar
    Product.collection.createIndex({ name: 'text' });
    Product.collection.createIndex({ category: 1 });
    Product.collection.createIndex({ createdAt: -1 });
    User.collection.createIndex({ email: 1 }, { unique: true });
    
    // Migrar dados do JSON para MongoDB
    migrarJSONparaMongo();
  })
  .catch(err => {
    console.log('⚠️ MongoDB não conectou, usando JSON fallback');
    console.log('   Erro:', err.message);
    usandoMongo = false;
  });
} else {
  console.log('⚠️ MONGODB_URI não definida, usando JSON fallback');
}

// ========== SCHEMAS (SIMPLIFICADOS) ==========
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

// Inicializar users.json
if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [{
    _id: "admin123",
    email: "admin@shoppe.com",
    password: bcrypt.hashSync('admin123', 10),
    createdAt: new Date().toISOString()
  }];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  console.log('✅ users.json criado');
}

if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2));
  console.log('✅ products.json criado');
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

// ========== FUNÇÃO DE MIGRAÇÃO ==========
async function migrarJSONparaMongo() {
  if (!usandoMongo) return;
  
  try {
    const produtosJSON = getProducts();
    if (produtosJSON.length === 0) return;
    
    console.log(`📦 Migrando ${produtosJSON.length} produtos do JSON para MongoDB...`);
    let migrados = 0;
    
    for (const produto of produtosJSON) {
      const existe = await Product.findOne({ 
        name: produto.name, 
        affiliateLink: produto.affiliateLink 
      });
      
      if (!existe) {
        await Product.create({
          name: produto.name,
          category: produto.category,
          description: produto.description,
          affiliateLink: produto.affiliateLink,
          images: produto.images || [],
          model3dUrl: produto.model3dUrl || '',
          createdAt: produto.createdAt ? new Date(produto.createdAt) : new Date()
        });
        migrados++;
      }
    }
    
    if (migrados > 0) {
      console.log(`✅ ${migrados} produtos migrados para o MongoDB`);
    }
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
  }
}

// ========== FUNÇÕES CRUD OTIMIZADAS ==========
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
    
    const products = await Product.find(query).sort({ createdAt: -1 });
    console.log(`📦 MongoDB: ${products.length} produtos encontrados`);
    return products;
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
    console.log(`💾 Produto salvo no MongoDB: ${product.name}`);
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
    console.log(`🔄 Produto atualizado: ${product.name}`);
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
    console.log(`🗑️ Produto deletado do MongoDB: ${id}`);
  } else {
    saveProducts(getProducts().filter(p => p._id !== id));
  }
}

// ========== FUNÇÕES DE BACKUP CLOUDINARY ==========
async function backupToCloudinary() {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return null;
    
    const products = await getProductsList();
    const users = getUsers();
    
    const backupData = {
      products,
      users,
      lastBackup: new Date().toISOString(),
      version: '1.0'
    };
    
    const jsonString = JSON.stringify(backupData, null, 2);
    
    const result = await cloudinary.uploader.upload(
      `data:application/json;base64,${Buffer.from(jsonString).toString('base64')}`,
      {
        resource_type: "raw",
        public_id: `encontrei-barato-backup`,
        folder: "shoppe_affiliate",
        overwrite: true,
      }
    );
    
    console.log(`✅ Backup salvo no Cloudinary`);
    return result.secure_url;
  } catch (err) {
    console.error('❌ Erro no backup:', err.message);
    return null;
  }
}

async function restoreFromCloudinary() {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return false;
    
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const url = `https://res.cloudinary.com/${cloudName}/raw/upload/shoppe_affiliate/encontrei-barato-backup`;
    
    const response = await fetch(url);
    if (!response.ok) return false;
    
    const backupData = await response.json();
    
    if (backupData.products && backupData.products.length > 0) {
      if (usandoMongo) {
        for (const product of backupData.products) {
          const existe = await Product.findOne({ name: product.name, affiliateLink: product.affiliateLink });
          if (!existe) {
            await Product.create(product);
          }
        }
        console.log(`✅ Restaurados ${backupData.products.length} produtos do backup`);
      } else {
        saveProducts(backupData.products);
      }
      return true;
    }
    
    return false;
  } catch (err) {
    console.error('❌ Erro na restauração:', err.message);
    return false;
  }
}

// ========== ROTAS API ==========

// Status do servidor
app.get('/api/status', (req, res) => {
  res.json({
    usandoMongo,
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    timestamp: new Date().toISOString()
  });
});

// Teste Cloudinary
app.get('/api/cloudinary-test', async (req, res) => {
  res.json({ 
    success: true, 
    cloudinaryConfigured: !!process.env.CLOUDINARY_CLOUD_NAME,
    usandoMongo
  });
});

// Login
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

// Produtos
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

// Criar produto com imagens
// Criar produto com imagens - CORRIGIDO (usando memory storage)
app.post('/api/products', upload.array('images', 5), async (req, res) => {
  try {
    console.log(`📦 NOVO PRODUTO: ${req.body.name}`);
    
    const images = [];
    
    if (req.files && req.files.length > 0 && process.env.CLOUDINARY_CLOUD_NAME) {
      for (const file of req.files) {
        try {
          // Upload direto do buffer (memory) - SEM SALVAR EM DISCO
          const uploadPromise = new Promise((resolve, reject) => {
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
            uploadStream.end(file.buffer);
          });
          
          const result = await uploadPromise;
          images.push(result.secure_url);
          console.log(`✅ Imagem enviada: ${result.secure_url}`);
        } catch (uploadErr) {
          console.error('❌ Erro no upload da imagem:', uploadErr.message);
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

// Atualizar produto
app.put('/api/products/:id', upload.array('images', 5), async (req, res) => {
  try {
    let images = null;
    
    if (req.files && req.files.length > 0 && process.env.CLOUDINARY_CLOUD_NAME) {
      images = [];
      for (const file of req.files) {
        const filePath = path.join(UPLOADS_DIR, file.filename);
        const result = await cloudinary.uploader.upload(filePath, {
          folder: 'shoppe_affiliate/products'
        });
        images.push(result.secure_url);
        try { fs.unlinkSync(filePath); } catch(e) {}
      }
    }
    
    const product = await updateProduct(req.params.id, req.body, images);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar produto
app.delete('/api/products/:id', async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    res.json({ message: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backup e restore
app.get('/api/backup', async (req, res) => {
  const url = await backupToCloudinary();
  res.json({ success: !!url, url });
});

app.post('/api/restore', async (req, res) => {
  const restored = await restoreFromCloudinary();
  res.json({ success: restored });
});

// Teste upload Cloudinary
app.post('/api/test-cloudinary-upload', upload.single('testImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }
    
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'shoppe_affiliate/test'
    });
    
    try { fs.unlinkSync(filePath); } catch(e) {}
    
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categorias
app.get('/api/categories', (req, res) => {
  const categories = [
    { id: 'eletronicos', name: 'Eletrônicos', color: '#00b4d8', icon: '📱' },
    { id: 'decoracao', name: 'Decoração', color: '#ff6b6b', icon: '🖼️' },
    { id: 'relogios', name: 'Relógios', color: '#ffd93d', icon: '⌚' },
    { id: 'tenis', name: 'Tênis', color: '#6c63ff', icon: '👟' },
    { id: 'roupas', name: 'Roupas', color: '#ff6b9d', icon: '👕' },
    { id: 'quarto', name: 'Quarto', color: '#a8e6cf', icon: '🛏️' },
    { id: 'cozinha', name: 'Cozinha', color: '#ff8c42', icon: '🍳' },
    { id: 'sala', name: 'Sala', color: '#ff4757', icon: '🛋️' },
    { id: 'banheiro', name: 'Banheiro', color: '#4d908e', icon: '🚿' },
    { id: 'area-externa', name: 'Área Externa', color: '#70e000', icon: '🌳' },
    { id: 'beleza', name: 'Beleza', color: '#ff85a1', icon: '💄' },
    { id: 'saude', name: 'Saúde', color: '#00c49a', icon: '💊' }
  ];
  res.json(categories);
});

// Setup
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
      <p>Banco: <strong>${usandoMongo ? 'MongoDB Atlas ✅' : 'JSON (local) ⚠️'}</strong></p>
      <p>Cloudinary: <strong>${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Ativo' : '❌ Inativo'}</strong></p>
      <a href="/admin">Ir para o Admin</a>
      </body></html>
    `);
  } catch (err) {
    res.send('❌ Erro: ' + err.message);
  }
});

// Debug
app.get('/api/debug-mode', async (req, res) => {
  const products = await getProductsList();
  res.json({
    usandoMongo,
    cloudinaryConfigured: !!process.env.CLOUDINARY_CLOUD_NAME,
    productCount: products.length
  });
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
    res.send(`
      <html><body>
      <h1>🚀 API funcionando!</h1>
      <p>Modo: ${usandoMongo ? 'MongoDB' : 'JSON fallback'}</p>
      <a href="/setup">Criar Admin</a>
      </body></html>
    `);
  });
}

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n═══════════════════════════════════════');
  console.log('🚀 SERVIDOR ONLINE');
  console.log('═══════════════════════════════════════');
  console.log(`📍 Porta: ${PORT}`);
  console.log(`💾 MongoDB: ${usandoMongo ? '✅ Conectado' : '❌ Usando JSON'}`);
  console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Ativo' : '❌ Inativo'}`);
  console.log('═══════════════════════════════════════\n');
});