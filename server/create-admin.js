require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({ email: String, password: String });
const User = mongoose.model('User', UserSchema);

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado ao MongoDB Atlas!');
    
    // Limpar admin antigo se existir
    await User.deleteOne({ email: 'admin@shoppe.com' });
    
    // Criar novo admin
    const hashed = await bcrypt.hash('admin123', 10);
    await User.create({ email: 'admin@shoppe.com', password: hashed });
    console.log('✅ Admin criado: admin@shoppe.com / admin123');
    
    // Listar usuários
    const users = await User.find();
    console.log('Usuários no banco:', users.length);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

createAdmin();
