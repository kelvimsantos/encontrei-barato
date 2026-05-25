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
  console.log('✅ Cloudinary configurado para backup');
} else {
  console.log('⚠️ Cloudinary não configurado - backups desabilitados');
}

// ========== CONFIG MULTER ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDirectories();
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
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

// Funções JSON com backup automático
function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  backupToCloudinary().catch(console.error);
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
  backupToCloudinary().catch(console.error);
}

// ========== FUNÇÕES DE BACKUP CLOUDINARY ==========
async function backupToCloudinary() {
  try {
    // Verificar se Cloudinary está configurado
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return null;
    }
    
    const products = getProducts();
    const users = getUsers();
    
    const backupData = {
      products,
      users,
      lastBackup: new Date().toISOString(),
      version: '1.0'
    };
    
    const jsonString = JSON.stringify(backupData, null, 2);
    const jsonBuffer = Buffer.from(jsonString);
    
    const result = await cloudinary.uploader.upload(
      `data:application/json;base64,${jsonBuffer.toString('base64')}`,
      {
        resource_type: "auto",
        public_id: `backups/encontrei-barato-backup`,
        folder: "shoppe_affiliate",
        overwrite: true
      }
    );
    
    console.log(`✅ Backup salvo no Cloudinary: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    console.error('❌ Erro no backup Cloudinary:', err.message);
    return null;
  }
}

async function restoreFromCloudinary() {
  try {
    // Verificar se Cloudinary está configurado
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.log('ℹ️ Cloudinary não configurado, pulando restauração');
      return false;
    }
    
    const backupUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/v1/shoppe_affiliate/backups/encontrei-barato-backup`;
    
    const response = await fetch(backupUrl);
    if (!response.ok) throw new Error('Backup não encontrado');
    
    const backupData = await response.json();
    
    if (backupData.products && backupData.products.length > 0) {
      saveProducts(backupData.products);
      console.log(`✅ Restaurados ${backupData.products.length} produtos do Cloudinary`);
    }
    
    if (backupData.users && backupData.users.length > 0) {
      // Não restaurar admin se já existir
      const existingUsers = getUsers();
      if (existingUsers.length === 0 || (existingUsers.length === 1 && existingUsers[0].email === 'admin@shoppe.com')) {
        saveUsers(backupData.users);
        console.log(`✅ Restaurados ${backupData.users.length} usuários do Cloudinary`);
      }
    }
    
    return true;
  } catch (err) {
    console.log('ℹ️ Nenhum backup encontrado no Cloudinary');
    return false;
  }
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

// ========== MIDDLEWARE DE UPLOAD GLOBAL ==========
app.use((req, res, next) => {
  ensureDirectories();
  next();
});

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
      <p>Backup Cloudinary: <strong>${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Ativo' : '❌ Inativo'}</strong></p>
      <br>
      <a href="/admin" style="background: #00b4d8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir para o Admin</a>
      </body></html>
    `);
  } catch (err) {
    res.send('❌ Erro: ' + err.message);
  }
});

// ========== ROTA DE BACKUP MANUAL ==========
app.get('/api/backup', async (req, res) => {
  try {
    const url = await backupToCloudinary();
    if (url) {
      res.json({ success: true, message: 'Backup realizado!', url });
    } else {
      res.json({ success: false, message: 'Erro no backup. Cloudinary configurado?' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  const startTime = Date.now();
  
  try {
    console.log('═══════════════════════════════════════');
    console.log('📦 NOVO PRODUTO RECEBIDO');
    console.log('═══════════════════════════════════════');
    console.log(`📝 Nome: ${req.body.name || 'N/A'}`);
    console.log(`🏷️ Categoria: ${req.body.category || 'N/A'}`);
    console.log(`📸 Quantidade de imagens: ${req.files ? req.files.length : 0}`);
    
    if (req.files && req.files.length > 0) {
      req.files.forEach((file, index) => {
        console.log(`   Imagem ${index + 1}: ${file.filename} (${(file.size / 1024).toFixed(2)} KB)`);
      });
    }
    
    ensureDirectories();
    
    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const filePath = path.join(UPLOADS_DIR, file.filename);
        if (fs.existsSync(filePath)) {
          images.push(`/uploads/${file.filename}`);
          console.log(`✅ Imagem salva: ${file.filename}`);
        } else {
          console.log(`⚠️ Arquivo não encontrado: ${file.filename}`);
        }
      }
    }
    
    const product = await createProduct(req.body, images);
    
    const duration = Date.now() - startTime;
    console.log(`✅ Produto criado com sucesso em ${duration}ms`);
    console.log(`🆔 ID: ${product._id}`);
    console.log(`🖼️ Imagens: ${images.length}`);
    console.log('═══════════════════════════════════════\n');
    
    res.status(201).json(product);
    
  } catch (err) {
    console.error('═══════════════════════════════════════');
    console.error('❌ ERRO AO CRIAR PRODUTO');
    console.error('═══════════════════════════════════════');
    console.error(`Erro: ${err.message}`);
    console.error(`Stack: ${err.stack}`);
    console.error('═══════════════════════════════════════\n');
    
    res.status(500).json({ 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

app.put('/api/products/:id', upload.array('images', 5), async (req, res) => {
  try {
    console.log(`🔄 Atualizando produto: ${req.params.id}`);
    console.log(`📸 Novas imagens: ${req.files ? req.files.length : 0}`);
    
    ensureDirectories();
    
    const images = req.files && req.files.length > 0 
      ? req.files.map(f => `/uploads/${f.filename}`) 
      : null;
    
    const product = await updateProduct(req.params.id, req.body, images);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    
    console.log(`✅ Produto ${req.params.id} atualizado`);
    res.json(product);
  } catch (err) {
    console.error('❌ Erro ao atualizar produto:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    console.log(`🗑️ Deletando produto: ${req.params.id}`);
    await deleteProduct(req.params.id);
    console.log(`✅ Produto ${req.params.id} deletado`);
    res.json({ message: 'Produto removido' });
  } catch (err) {
    console.error('❌ Erro ao deletar produto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== ROTA DE TESTE DE UPLOAD ==========
app.post('/api/test-upload', upload.single('test'), (req, res) => {
  try {
    console.log('🧪 Teste de upload recebido');
    console.log('Arquivo:', req.file);
    res.json({ 
      success: true, 
      file: req.file ? req.file.filename : 'nenhum arquivo',
      message: 'Upload funcionando!'
    });
  } catch (err) {
    console.error('Erro no teste:', err);
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
    res.send(`
      <html><body style="font-family: Arial; text-align: center; padding: 50px;">
      <h1>🚀 API funcionando!</h1>
      <p>Frontend não construído ainda. Execute <code>npm run build</code> na pasta client.</p>
      <p>Modo: <strong>${usandoMongo ? 'MongoDB Atlas' : 'JSON (fallback)'}</strong></p>
      <p>Backup Cloudinary: <strong>${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Ativo' : '❌ Inativo'}</strong></p>
      <br>
      <a href="/setup">Criar Admin</a>
      </body></html>
    `);
  });
}

// ========== TENTAR RESTAURAR BACKUP NA INICIALIZAÇÃO ==========
(async () => {
  if (getProducts().length === 0 && process.env.CLOUDINARY_CLOUD_NAME) {
    console.log('📦 Nenhum produto local, tentando restaurar backup do Cloudinary...');
    await restoreFromCloudinary();
  }
})();

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n═══════════════════════════════════════');
  console.log('🚀 ENCONTREI BARATO - SERVIDOR ONLINE');
  console.log('═══════════════════════════════════════');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
  console.log(`⚙️ Setup: http://localhost:${PORT}/setup`);
  console.log(`🧪 Teste upload: http://localhost:${PORT}/api/test-upload`);
  console.log(`💾 Modo: ${usandoMongo ? 'MongoDB Atlas' : 'JSON (fallback)'}`);
  console.log(`☁️ Backup Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Ativo' : '❌ Inativo'}`);
  console.log(`📁 Uploads: ${UPLOADS_DIR}`);
  console.log(`💾 Dados: ${DATA_DIR}`);
  console.log('═══════════════════════════════════════\n');
  
  try {
    fs.accessSync(UPLOADS_DIR, fs.constants.W_OK);
    console.log('✅ Pasta uploads está gravável');
  } catch (err) {
    console.log('⚠️ AVISO: Pasta uploads não está gravável!');
  }
});