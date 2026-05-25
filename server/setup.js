require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({ 
  email: String, 
  password: String 
});
const User = mongoose.model('User', UserSchema);

async function setup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');
    
    const existing = await User.findOne({ email: 'admin@shoppe.com' });
    if (!existing) {
      const hashed = await bcrypt.hash('admin123', 10);
      await User.create({ email: 'admin@shoppe.com', password: hashed });
      console.log('✅ Admin criado: admin@shoppe.com / admin123');
    } else {
      console.log('✅ Admin já existe');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err);
    process.exit(1);
  }
}

setup();