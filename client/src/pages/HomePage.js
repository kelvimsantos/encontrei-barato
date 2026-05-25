import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaSearch } from 'react-icons/fa';
import api from '../services/api';
import './HomePage.css';

function HomePage() {
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const response = await api.get('/categories');
    setCategories(response.data);
  };

  const handleSearch = async () => {
    if (searchTerm.trim()) {
      const response = await api.get(`/products?search=${searchTerm}`);
      setSearchResults(response.data);
      setShowSearch(true);
    }
  };

  return (
    <div className="home-container">
      <div className="hero-section">
        <motion.h1 
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          className="hero-title"
        >
          Shop<span className="highlight">pe</span> Affiliate
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="hero-subtitle"
        >
          Os melhores produtos com preços incríveis!
        </motion.p>
      </div>

      <div className="search-bar-container">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar produtos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>
            <FaSearch />
          </button>
        </div>
      </div>

      {showSearch && searchResults.length > 0 && (
        <motion.div 
          className="search-results"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2>Resultados da busca</h2>
          <div className="products-grid">
            {searchResults.map(product => (
              <div 
                key={product._id} 
                className="product-card"
                onClick={() => navigate(`/product/${product._id}`)}
              >
                <img src={product.images[0]} alt={product.name} />
                <h3>{product.name}</h3>
                <p>{product.description.substring(0, 100)}...</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="categories-section">
        <h2>Categorias</h2>
        <div className="categories-grid">
          {categories.map((category, index) => (
            <motion.div
              key={category.id}
              className="category-card"
              style={{ '--category-color': category.color }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.05, rotate: 5 }}
              onClick={() => navigate(`/category/${category.id}`)}
            >
              <div className="category-icon">{category.icon}</div>
              <div className="category-name">{category.name}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HomePage;