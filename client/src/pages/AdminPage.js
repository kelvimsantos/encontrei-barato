import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes, FaCopy } from 'react-icons/fa';
import api from '../services/api';
import './AdminPage.css';

function AdminPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
    affiliateLink: '',
    model3dUrl: '',
    images: []
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
      fetchData();
    }
  }, []);

  const fetchData = async () => {
    const productsRes = await api.get('/products');
    const categoriesRes = await api.get('/categories');
    setProducts(productsRes.data);
    setCategories(categoriesRes.data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/login', { email, password });
      localStorage.setItem('token', response.data.token);
      setIsAuthenticated(true);
      fetchData();
    } catch (error) {
      alert('Email ou senha inválidos');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setEmail('');
    setPassword('');
  };

  const handleFileChange = (e) => {
    setSelectedFiles(Array.from(e.target.files));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const formDataToSend = new FormData();
    formDataToSend.append('name', formData.name);
    formDataToSend.append('category', formData.category);
    formDataToSend.append('description', formData.description);
    formDataToSend.append('affiliateLink', formData.affiliateLink);
    if (formData.model3dUrl) formDataToSend.append('model3dUrl', formData.model3dUrl);
    
    selectedFiles.forEach(file => {
      formDataToSend.append('images', file);
    });

    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct._id}`, formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert('Produto atualizado com sucesso!');
      } else {
        await api.post('/products', formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert('Produto criado com sucesso!');
      }
      
      resetForm();
      fetchData();
    } catch (error) {
      alert('Erro ao salvar produto: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (productId) => {
    if (window.confirm('Tem certeza que deseja deletar este produto?')) {
      try {
        await api.delete(`/products/${productId}`);
        alert('Produto deletado!');
        fetchData();
      } catch (error) {
        alert('Erro ao deletar produto');
      }
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      description: product.description,
      affiliateLink: product.affiliateLink,
      model3dUrl: product.model3dUrl || '',
      images: product.images
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      category: '',
      description: '',
      affiliateLink: '',
      model3dUrl: '',
      images: []
    });
    setSelectedFiles([]);
    setShowForm(false);
  };

  const getShareableLink = (productId) => {
    return `${window.location.origin}/product/${productId}`;
  };

  const copyToClipboard = (productId) => {
    const link = getShareableLink(productId);
    navigator.clipboard.writeText(link);
    alert('Link copiado! Compartilhe com seus clientes.');
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="login-box">
          <h2>Área do Admin</h2>
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Entrar</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Painel do Administrador</h1>
        <button className="logout-btn" onClick={handleLogout}>Sair</button>
      </div>

      <div className="admin-actions">
        <button className="add-product-btn" onClick={() => setShowForm(true)}>
          <FaPlus /> Novo Produto
        </button>
        
        <div className="search-box">
          <input
            type="text"
            placeholder="Buscar produtos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div 
            className="product-form-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="product-form"
              initial={{ y: -50 }}
              animate={{ y: 0 }}
            >
              <div className="form-header">
                <h2>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
                <button className="close-btn" onClick={resetForm}>
                  <FaTimes />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Nome do Produto *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Categoria *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    required
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Descrição do Produto *</label>
                  <textarea
                    rows="5"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Link de Afiliado Shopee *</label>
                  <input
                    type="url"
                    value={formData.affiliateLink}
                    onChange={(e) => setFormData({...formData, affiliateLink: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>URL do Modelo 3D (GLB/GLTF) - Opcional</label>
                  <input
                    type="url"
                    value={formData.model3dUrl}
                    onChange={(e) => setFormData({...formData, model3dUrl: e.target.value})}
                    placeholder="https://exemplo.com/modelo.glb"
                  />
                </div>

                <div className="form-group">
                  <label>Imagens do Produto *</label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="file-input"
                  />
                  <small>Você pode selecionar até 5 imagens</small>
                  
                  {formData.images.length > 0 && !selectedFiles.length && (
                    <div className="existing-images">
                      <p>Imagens atuais:</p>
                      <div className="image-preview">
                        {formData.images.map((img, idx) => (
                          <img key={idx} src={img} alt={`Preview ${idx}`} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button type="submit" className="submit-btn" disabled={loading}>
                  <FaSave /> {loading ? 'Salvando...' : (editingProduct ? 'Atualizar' : 'Criar Produto')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="products-list">
        <h2>Produtos Cadastrados ({filteredProducts.length})</h2>
        
        <div className="products-table">
          <table>
            <thead>
              <tr>
                <th>Imagem</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Link Compartilhável</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <motion.tr 
                  key={product._id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <td>
                    <img src={product.images[0]} alt={product.name} className="product-thumb" />
                  </td>
                  <td>{product.name}</td>
                  <td>
                    {categories.find(c => c.id === product.category)?.icon} {product.category}
                  </td>
                  <td>
                    <div className="share-link">
                      <input 
                        type="text" 
                        readOnly 
                        value={getShareableLink(product._id)} 
                        className="link-input"
                      />
                      <button onClick={() => copyToClipboard(product._id)} className="copy-btn">
                        <FaCopy /> Copiar
                      </button>
                    </div>
                  </td>
                  <td className="actions">
                    <button onClick={() => handleEdit(product)} className="edit-btn">
                      <FaEdit />
                    </button>
                    <button onClick={() => handleDelete(product._id)} className="delete-btn">
                      <FaTrash />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AdminPage;