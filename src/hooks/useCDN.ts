import { useContext } from 'react';
import { CDNContext } from '../contexts/CDNContext';

export const useCDN = () => {
  const context = useContext(CDNContext);
  if (!context) throw new Error('useCDN must be used within CDNProvider');
  return context;
};
