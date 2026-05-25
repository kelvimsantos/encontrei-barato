import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectCards } from 'swiper/modules';
import { FaShoppingCart, FaArrowLeft } from 'react-icons/fa';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import api from '../services/api';
import 'swiper/css';
import 'swiper/css/effect-cards';
import './ProductDetailPage.css';

function Model3D({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={2} />;
}

function ProductDetailPage() {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [category, setCategory] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    const response = await api.get(`/products/${productId}`);
    setProduct(response.data);
    
    const categoriesResponse = await api.get('/categories');
    const cat = categoriesResponse.data.find(c => c.id === response.data.category);
    setCategory(cat);
  };

  const handleBuy = () => {
    window.open(product.affiliateLink, '_blank');
  };

  if (!product || !category) return <div className="loading">Carregando...</div>;

  return (
    <div className="product-detail-page" style={{ '--category-color': category.color }}>
      <button className="back-button" onClick={() => navigate(-1)}>
        <FaArrowLeft /> Voltar
      </button>

      <div className="product-content">
        <motion.div 
          className="product-gallery"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Swiper
            effect="cards"
            grabCursor={true}
            modules={[EffectCards, Autoplay]}
            autoplay={{ delay: 3000, disableOnInteraction: false }}
            className="product-swiper"
          >
            {product.images.map((image, index) => (
              <SwiperSlide key={index}>
                <img src={image} alt={product.name} />
              </SwiperSlide>
            ))}
          </Swiper>
        </motion.div>

        <motion.div 
          className="product-info"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="category-badge" style={{ background: category.color }}>
            {category.icon} {category.name}
          </div>
          
          <h1>{product.name}</h1>
          
          <div className="product-description">
            <p>{product.description}</p>
          </div>

          <div className="product-actions">
            <motion.button 
              className="buy-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBuy}
            >
              <FaShoppingCart /> Adquirir na Shopee
            </motion.button>
          </div>
        </motion.div>
      </div>

      {product.model3dUrl && (
        <motion.div 
          className="model3d-container"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2>Visualização 3D</h2>
          <div className="model3d-viewer">
            <Canvas camera={{ position: [0, 0, 5] }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <Model3D url={product.model3dUrl} />
              <OrbitControls enableZoom={true} />
              <Environment preset="city" />
            </Canvas>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default ProductDetailPage;