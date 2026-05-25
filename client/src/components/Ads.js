import React, { useState, useEffect } from 'react';
import './Ads.css';

function Ads() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const ads = {
    left: {
      image: 'https://via.placeholder.com/160x600/00b4d8/ffffff?text=Anúncio',
      link: 'https://s.shopee.com.br/...',
      alt: 'Anúncio Shopee'
    },
    right: {
      image: 'https://via.placeholder.com/160x600/ff6b6b/ffffff?text=Promoção',
      link: 'https://s.shopee.com.br/...',
      alt: 'Promoção Especial'
    }
  };

  if (isMobile) {
    return (
      <div className="mobile-ads-container">
        <div className="mobile-banner-ad">
          <a href={ads.left.link} target="_blank" rel="noopener noreferrer">
            <img src={ads.left.image} alt={ads.left.alt} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="side-ad left-ad">
        <a href={ads.left.link} target="_blank" rel="noopener noreferrer">
          <img src={ads.left.image} alt={ads.left.alt} />
        </a>
      </div>
      <div className="side-ad right-ad">
        <a href={ads.right.link} target="_blank" rel="noopener noreferrer">
          <img src={ads.right.image} alt={ads.right.alt} />
        </a>
      </div>
    </>
  );
}

export default Ads;