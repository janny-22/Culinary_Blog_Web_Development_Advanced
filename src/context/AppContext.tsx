import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Recipe, Category, ApplicationUser, Role, RecipeFilterParams, SystemHealth } from '../types';
import { MOCK_RECIPES, MOCK_CATEGORIES, MOCK_USERS, MOCK_SYSTEM_HEALTH, unaccent, generateSlug } from '../data/mockData';

interface ToastInfo {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'error' | 'info';
}

interface ActiveTimer {
  recipeTitle: string;
  stepNumber: number;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
}

interface AppContextType {
  pathname: string;
  searchParams: URLSearchParams;
  navigate: (url: string) => void;
  currentUser: ApplicationUser | null;
  setCurrentUser: (user: ApplicationUser | null) => void;
  switchRole: (role: Role) => void;
  logout: () => void;
  loginWithGoogle: () => void;
  
  // Data
  recipes: Recipe[];
  categories: Category[];
  systemHealth: SystemHealth;
  
  // Operations
  createRecipe: (data: Partial<Recipe>) => { success: boolean; slug?: string; error?: string };
  updateRecipe: (id: string, data: Partial<Recipe>) => { success: boolean; error?: string };
  deleteRecipe: (id: string) => { success: boolean; error?: string };
  publishRecipe: (id: string) => { success: boolean; error?: string };
  unpublishRecipe: (id: string) => { success: boolean; error?: string };
  archiveRecipe: (id: string) => { success: boolean; error?: string };
  toggleLike: (id: string) => void;
  likedRecipeIds: string[];
  bookmarks: string[];
  toggleBookmark: (id: string) => void;
  
  // Search & Filtering
  filterRecipes: (params: RecipeFilterParams) => Recipe[];
  
  // Modals & Overlays
  searchModalOpen: boolean;
  setSearchModalOpen: (open: boolean) => void;
  healthModalOpen: boolean;
  setHealthModalOpen: (open: boolean) => void;
  jsonLdRecipe: Recipe | null;
  setJsonLdRecipe: (recipe: Recipe | null) => void;
  
  // Toasts
  toasts: ToastInfo[];
  showToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  
  // Kitchen Timer
  activeTimer: ActiveTimer | null;
  startTimer: (recipeTitle: string, stepNumber: number, minutes: number) => void;
  togglePauseTimer: () => void;
  resetTimer: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // Sync with browser URL / hash
  const [currentUrl, setCurrentUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const search = window.location.search;
      return path ? `${path}${search}` : '/';
    }
    return '/';
  });

  const { pathname, searchParams } = useMemo(() => {
    try {
      const [path, query] = currentUrl.split('?');
      return {
        pathname: path || '/',
        searchParams: new URLSearchParams(query || ''),
      };
    } catch {
      return { pathname: '/', searchParams: new URLSearchParams() };
    }
  }, [currentUrl]);

  const navigate = (url: string) => {
    setCurrentUrl(url);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentUrl(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Current logged in user (Defaults to Chef Minh Tuấn - Author role)
  const [currentUser, setCurrentUser] = useState<ApplicationUser | null>(MOCK_USERS[0]);
  const [recipes, setRecipes] = useState<Recipe[]>(MOCK_RECIPES);
  const [categories, setCategories] = useState<Category[]>(MOCK_CATEGORIES);
  const [likedRecipeIds, setLikedRecipeIds] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  
  // Modals
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [jsonLdRecipe, setJsonLdRecipe] = useState<Recipe | null>(null);
  const [toasts, setToasts] = useState<ToastInfo[]>([]);

  // Kitchen Timer
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeTimer && activeTimer.isRunning && activeTimer.remainingSeconds > 0) {
      interval = setInterval(() => {
        setActiveTimer((prev) => {
          if (!prev) return null;
          if (prev.remainingSeconds <= 1) {
            showToast('Hẹn giờ hoàn thành!', `Bước ${prev.stepNumber} của ${prev.recipeTitle} đã xong.`, 'info');
            // Try sound play
            try {
              const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
              const osc = audioCtx.createOscillator();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
              osc.connect(audioCtx.destination);
              osc.start();
              osc.stop(audioCtx.currentTime + 0.6);
            } catch {
              // fallback silent
            }
            return { ...prev, remainingSeconds: 0, isRunning: false };
          }
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimer]);

  const startTimer = (recipeTitle: string, stepNumber: number, minutes: number) => {
    const totalSeconds = Math.max(1, Math.round(minutes * 60));
    setActiveTimer({
      recipeTitle,
      stepNumber,
      totalSeconds,
      remainingSeconds: totalSeconds,
      isRunning: true,
    });
    showToast('Bắt đầu hẹn giờ', `Bước ${stepNumber}: ${minutes} phút đang đếm ngược.`, 'info');
  };

  const togglePauseTimer = () => {
    setActiveTimer((prev) => (prev ? { ...prev, isRunning: !prev.isRunning } : null));
  };

  const resetTimer = () => {
    setActiveTimer(null);
  };

  const showToast = (title: string, description?: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const switchRole = (role: Role) => {
    if (role === 'Guest') {
      setCurrentUser(null);
      showToast('Đã chuyển sang vai trò Khách', 'Chế độ xem công khai không có quyền sửa đổi.', 'info');
    } else if (role === 'Author') {
      setCurrentUser(MOCK_USERS[0]);
      showToast('Đã chuyển sang Tác giả', 'Đang đăng nhập dưới tư cách Chef Minh Tuấn.', 'success');
    } else if (role === 'Admin') {
      setCurrentUser(MOCK_USERS[2]);
      showToast('Đã chuyển sang Quản trị viên', 'Quyền Admin toàn quyền quản lý bài viết & danh mục.', 'success');
    }
  };

  const logout = () => {
    setCurrentUser(null);
    showToast('Đã đăng xuất', 'Bạn đang duyệt web dưới chế độ Khách.', 'info');
    navigate('/');
  };

  const loginWithGoogle = () => {
    setCurrentUser(MOCK_USERS[0]);
    showToast('Đăng nhập Google thành công', `Chào mừng ${MOCK_USERS[0].displayName} quay trở lại!`, 'success');
  };

  const toggleLike = (id: string) => {
    setLikedRecipeIds((prev) => {
      const isLiked = prev.includes(id);
      const updated = isLiked ? prev.filter((item) => item !== id) : [...prev, id];
      setRecipes((all) =>
        all.map((r) => (r.id === id ? { ...r, likeCount: r.likeCount + (isLiked ? -1 : 1) } : r))
      );
      return updated;
    });
  };

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const isSaved = prev.includes(id);
      const updated = isSaved ? prev.filter((item) => item !== id) : [...prev, id];
      showToast(isSaved ? 'Đã bỏ lưu công thức' : 'Đã lưu công thức vào sổ tay');
      return updated;
    });
  };

  // Recipe Operations
  const createRecipe = (data: Partial<Recipe>) => {
    if (!currentUser) {
      return { success: false, error: 'Bạn phải đăng nhập để tạo công thức.' };
    }
    if (!data.title || data.title.trim().length < 5) {
      return { success: false, error: 'Tiêu đề công thức phải từ 5 ký tự trở lên.' };
    }
    if (!data.categoryId) {
      return { success: false, error: 'Vui lòng chọn danh mục phù hợp.' };
    }

    const title = data.title.trim();
    let baseSlug = generateSlug(title);
    if (recipes.some((r) => r.slug === baseSlug)) {
      baseSlug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;
    }

    const now = new Date().toISOString();
    const newRecipe: Recipe = {
      id: `recipe-${Date.now()}`,
      title,
      slug: baseSlug,
      description: data.description || '',
      instructions: data.instructions || '',
      prepTimeMinutes: Number(data.prepTimeMinutes) || 15,
      cookTimeMinutes: Number(data.cookTimeMinutes) || 30,
      servings: Number(data.servings) || 4,
      difficulty: data.difficulty || 'Medium',
      status: data.status || 'Draft',
      categoryId: data.categoryId,
      authorId: currentUser.id,
      author: currentUser,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === 'Published' ? now : undefined,
      viewCount: 0,
      likeCount: 0,
      nutrition: data.nutrition || { calories: 350 },
      steps: data.steps || [],
      ingredients: data.ingredients || [],
      images: data.images && data.images.length > 0 ? data.images : [
        {
          id: `img-${Date.now()}`,
          recipeId: `recipe-${Date.now()}`,
          originalUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80',
          isPrimary: true,
          orderIndex: 1,
        }
      ],
    };

    setRecipes((prev) => [newRecipe, ...prev]);
    // update category count
    setCategories((prev) =>
      prev.map((c) => (c.id === newRecipe.categoryId ? { ...c, recipeCount: c.recipeCount + 1 } : c))
    );

    showToast('Tạo công thức thành công', `Đã lưu công thức "${title}"`, 'success');
    return { success: true, slug: newRecipe.slug };
  };

  const updateRecipe = (id: string, data: Partial<Recipe>) => {
    const existing = recipes.find((r) => r.id === id);
    if (!existing) {
      return { success: false, error: 'Không tìm thấy công thức.' };
    }
    if (currentUser?.role !== 'Admin' && existing.authorId !== currentUser?.id) {
      return { success: false, error: 'Bạn không có quyền chỉnh sửa công thức này.' };
    }

    const now = new Date().toISOString();
    setRecipes((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const updated: Recipe = {
            ...r,
            ...data,
            updatedAt: now,
            slug: data.title && data.title !== r.title ? generateSlug(data.title) : r.slug,
          };
          return updated;
        }
        return r;
      })
    );

    showToast('Cập nhật thành công', `Công thức "${existing.title}" đã được lưu.`, 'success');
    return { success: true };
  };

  const deleteRecipe = (id: string) => {
    const existing = recipes.find((r) => r.id === id);
    if (!existing) return { success: false, error: 'Không tìm thấy công thức.' };
    if (currentUser?.role !== 'Admin' && existing.authorId !== currentUser?.id) {
      return { success: false, error: 'Bạn không có quyền xóa công thức này.' };
    }

    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setCategories((prev) =>
      prev.map((c) => (c.id === existing.categoryId ? { ...c, recipeCount: Math.max(0, c.recipeCount - 1) } : c))
    );
    showToast('Đã xóa công thức', `Công thức "${existing.title}" đã bị loại bỏ.`, 'info');
    return { success: true };
  };

  const publishRecipe = (id: string) => {
    const existing = recipes.find((r) => r.id === id);
    if (!existing) return { success: false, error: 'Không tìm thấy công thức.' };
    if (existing.steps.length === 0) {
      return {
        success: false,
        error: 'Quy tắc xuất bản: Công thức phải có ít nhất 1 bước thực hiện (RecipeStep).',
      };
    }
    if (existing.ingredients.length === 0) {
      return {
        success: false,
        error: 'Quy tắc xuất bản: Công thức phải có ít nhất 1 nguyên liệu.',
      };
    }

    const now = new Date().toISOString();
    setRecipes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Published', publishedAt: now, updatedAt: now } : r))
    );
    showToast('Xuất bản thành công', `Công thức "${existing.title}" đã công khai cho mọi người!`, 'success');
    return { success: true };
  };

  const unpublishRecipe = (id: string) => {
    const existing = recipes.find((r) => r.id === id);
    if (!existing) return { success: false, error: 'Không tìm thấy công thức.' };

    const now = new Date().toISOString();
    setRecipes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Draft', updatedAt: now } : r))
    );
    showToast('Đã chuyển thành bản nháp', `Công thức "${existing.title}" chỉ bạn mới nhìn thấy.`, 'info');
    return { success: true };
  };

  const archiveRecipe = (id: string) => {
    const existing = recipes.find((r) => r.id === id);
    if (!existing) return { success: false, error: 'Không tìm thấy công thức.' };

    const now = new Date().toISOString();
    setRecipes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Archived', updatedAt: now } : r))
    );
    showToast('Đã lưu trữ công thức', `Công thức "${existing.title}" đã được chuyển vào mục lưu trữ.`, 'info');
    return { success: true };
  };

  const filterRecipes = (params: RecipeFilterParams): Recipe[] => {
    return recipes.filter((r) => {
      // Visibility rule based on FR-RCP-001 & FR-RCP-002
      if (currentUser?.role === 'Admin') {
        // Admin sees all
      } else if (currentUser?.role === 'Author') {
        // Author sees published + own drafts/archived
        if (r.status !== 'Published' && r.authorId !== currentUser.id) return false;
      } else {
        // Guest only sees published
        if (r.status !== 'Published') return false;
      }

      // Search term
      if (params.searchTerm && params.searchTerm.trim()) {
        const query = unaccent(params.searchTerm);
        const titleMatch = unaccent(r.title).includes(query);
        const descMatch = unaccent(r.description).includes(query);
        const ingredientMatch = r.ingredients.some((ing) => unaccent(ing.name).includes(query));
        if (!titleMatch && !descMatch && !ingredientMatch) return false;
      }

      // Category
      if (params.categoryId && params.categoryId !== 'all') {
        if (r.categoryId !== params.categoryId) return false;
      }

      // Difficulty
      if (params.difficulty && params.difficulty !== 'All') {
        if (r.difficulty !== params.difficulty) return false;
      }

      // Max Cook Time
      if (params.maxCookTime && params.maxCookTime > 0) {
        if (r.cookTimeMinutes > params.maxCookTime) return false;
      }

      return true;
    }).sort((a, b) => {
      if (params.sort === 'createdAt') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (params.sort === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (params.sort === 'cookTime') {
        return a.cookTimeMinutes - b.cookTimeMinutes;
      }
      // default: -createdAt
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  return (
    <AppContext.Provider
      value={{
        pathname,
        searchParams,
        navigate,
        currentUser,
        setCurrentUser,
        switchRole,
        logout,
        loginWithGoogle,
        recipes,
        categories,
        systemHealth: MOCK_SYSTEM_HEALTH,
        createRecipe,
        updateRecipe,
        deleteRecipe,
        publishRecipe,
        unpublishRecipe,
        archiveRecipe,
        toggleLike,
        likedRecipeIds,
        bookmarks,
        toggleBookmark,
        filterRecipes,
        searchModalOpen,
        setSearchModalOpen,
        healthModalOpen,
        setHealthModalOpen,
        jsonLdRecipe,
        setJsonLdRecipe,
        toasts,
        showToast,
        removeToast,
        activeTimer,
        startTimer,
        togglePauseTimer,
        resetTimer,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
