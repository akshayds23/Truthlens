import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, Claim, FactCheckReport } from '../types';
import { authService } from '../services/api';

interface AppContextType {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Current claim/report
  currentClaim: Claim | null;
  currentReport: FactCheckReport | null;
  processingProgress: number;

  // Theme state
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  setCurrentClaim: (claim: Claim) => void;
  setCurrentReport: (report: FactCheckReport) => void;
  setProcessingProgress: (progress: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentClaim, setCurrentClaim] = useState<Claim | null>(null);
  const [currentReport, setCurrentReport] = useState<FactCheckReport | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Initialize user and theme from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setTheme(storedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
    
    setIsLoading(false);
  }, []);

  // Update DOM when theme changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authService.login(email, password);
      setUser(response.user);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    setIsLoading(true);
    try {
      const response = await authService.register(email, password, fullName);
      setUser(response.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setCurrentClaim(null);
    setCurrentReport(null);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        currentClaim,
        currentReport,
        processingProgress,
        theme,
        toggleTheme,
        login,
        register,
        logout,
        setCurrentClaim,
        setCurrentReport,
        setProcessingProgress,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

