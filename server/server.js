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
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('📁 Pasta uploads criada');
}

// Servir arquivos estáticos
app.use('/uploads', express.static(UPLOADS_DIR));

// ========== CONFIG CLOUDINARY (igual ao projeto que funciona) ==========
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('✅ Cloudinary configurado');

// ========== CONFIG MULTER (igual ao projeto que funciona) ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens são permitidas.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ========== CONEXÃO MONGODB (igual ao projeto que funciona) ==========
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado ao MongoDB Atlas'))
.catch(err => console.error('❌ Erro na conexão com o MongoDB:', err));

// ========== MODELS ==========
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
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

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error();
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    const user = await User.findById(decoded.userId);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Autenticação necessária' });
  }
};

// ========== ROTA DE SETUP ==========
app.get('/setup', async (req, res) => {
  try {
    await User.deleteOne({ email: 'admin@shoppe.com' });
    const hashed = await bcrypt.hash('admin123', 10);
    await User.create({ email: 'admin@shoppe.com', password: hashed });
    res.send(`
      <html><body style="font-family: Arial; text-align: center; padding: 50px;">
      <h1>✅ Admin Criado!</h1>
      <p>Email: <strong>admin@shoppe.com</strong></p>
      <p>Senha: <strong>admin123</strong></p>
      <p>MongoDB: <strong>Conectado</strong></p>
      <p>Cloudinary: <strong>Configurado</strong></p>
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
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
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

// ROTA DE UPLOAD (igual ao projeto que funciona)
app.post('/api/products', upload.array('images', 5), async (req, res) => {
  try {
    console.log('📦 Produto:', req.body.name);
    console.log('📸 Imagens:', req.files ? req.files.length : 0);
    
    const images = [];
    
    // Upload para o Cloudinary (igual ao projeto que funciona)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'encontrei_barato/produtos',
          transformation: [{ width: 800, height: 800, crop: 'limit' }]
        });
        images.push(result.secure_url);
        console.log(`✅ Imagem: ${result.secure_url}`);
        
        // Remove arquivo temporário
        try { fs.unlinkSync(file.path); } catch(e) {}
      }
    }
    
    const product = new Product({
      name: req.body.name,
      category: req.body.category,
      description: req.body.description,
      affiliateLink: req.body.affiliateLink,
      model3dUrl: req.body.model3dUrl || '',
      images: images
    });
    
    await product.save();
    console.log(`✅ Produto criado: ${product._id}`);
    res.status(201).json(product);
    
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', upload.array('images', 5), auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    
    let images = product.images;
    
    if (req.files && req.files.length > 0) {
      images = [];
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'encontrei_barato/produtos',
          transformation: [{ width: 800, height: 800, crop: 'limit' }]
        });
        images.push(result.secure_url);
        try { fs.unlinkSync(file.path); } catch(e) {}
      }
    }
    
    product.name = req.body.name || product.name;
    product.category = req.body.category || product.category;
    product.description = req.body.description || product.description;
    product.affiliateLink = req.body.affiliateLink || product.affiliateLink;
    product.model3dUrl = req.body.model3dUrl || product.model3dUrl;
    product.images = images;
    
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
      <p>Frontend não construído ainda.</p>
      <br>
      <a href="/setup">Criar Admin</a>
      </body></html>
    `);
  });
}

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`⚙️ Setup: http://localhost:${PORT}/setup`);
  console.log('═══════════════════════════════════════\n');
});