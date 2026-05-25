import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import './CategoryPage.css';

function CategoryPage() {
  const { categoryId } = useParams();
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategoryInfo();
    fetchProducts();
  }, [categoryId]);

  const fetchCategoryInfo = async () => {
    const response = await api.get('/categories');
    const cat = response.data.find(c => c.id === categoryId);
    setCategory(cat);
  };

  const fetchProducts = async () => {
    const response = await api.get(`/products?category=${categoryId}`);
    setProducts(response.data);
  };

  const handleProductClick = (productId) => {
    navigate(`/product/${productId}`);
  };

  if (!category) return <div className="loading">Carregando...</div>;

  return (
    <div className="category-page" style={{ '--category-color': category.color }}>
      <div className="category-header" style={{ background: category.bgColor }}>
        <motion.div 
          className="category-info"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="category-icon-large">{category.icon}</div>
          <h1>{category.name}</h1>
        </motion.div>
      </div>

      <div className="products-container">
        {products.length === 0 ? (
          <div className="no-products">
            <p>Nenhum produto nesta categoria ainda.</p>
          </div>
        ) : (
          <div className="products-carousel">
            {products.map((product, index) => (
              <motion.div
                key={product._id}
                className="product-item"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => handleProductClick(product._id)}
              >
                <div className="product-image-container">
                  <img src={product.images[0]} alt={product.name} />
                  <div className="product-overlay">
                    <span>Ver detalhes</span>
                  </div>
                </div>
                <h3>{product.name}</h3>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CategoryPage;