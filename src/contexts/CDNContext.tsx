import React, { createContext, useState, useEffect } from 'react';

interface CDNContextType {
  useChinaCDN: boolean;
  setUseChinaCDN: (value: boolean) => void;
  toggleChinaCDN: () => void;
}

export const CDNContext = createContext<CDNContextType | undefined>(undefined);

const CDN_STORAGE_KEY = 'openslides_china_cdn';

const CDNProvider = ({ children }: { children: React.ReactNode }) => {
  const [useChinaCDN, setUseChinaCDN] = useState<boolean>(() => {
    return localStorage.getItem(CDN_STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(CDN_STORAGE_KEY, String(useChinaCDN));
  }, [useChinaCDN]);

  const toggleChinaCDN = () => {
    setUseChinaCDN(prev => !prev);
  };

  return (
    <CDNContext.Provider value={{ useChinaCDN, setUseChinaCDN, toggleChinaCDN }}>
      {children}
    </CDNContext.Provider>
  );
};

export default CDNProvider;
