import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// Cache structure implementing IMemoryCache with 60-minute sliding expiration (SRS FR-CAT-001)
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  slidingMinutes: number;
  lastAccessed: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): { hit: boolean; data?: T; ttlRemainingSeconds?: number } {
    const entry = this.cache.get(key);
    if (!entry) return { hit: false };
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return { hit: false };
    }
    // Sliding expiration: update expiresAt on access
    entry.lastAccessed = now;
    entry.expiresAt = now + entry.slidingMinutes * 60 * 1000;
    return { 
      hit: true, 
      data: entry.value,
      ttlRemainingSeconds: Math.round((entry.expiresAt - now) / 1000)
    };
  }

  set<T>(key: string, value: T, slidingMinutes: number = 60) {
    const now = Date.now();
    this.cache.set(key, {
      value,
      slidingMinutes,
      lastAccessed: now,
      expiresAt: now + slidingMinutes * 60 * 1000,
    });
  }

  remove(key: string): boolean {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  getEntries() {
    const now = Date.now();
    const result: { key: string; ttlRemainingSeconds: number; expiresAt: string }[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (now <= entry.expiresAt) {
        result.push({
          key,
          ttlRemainingSeconds: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
          expiresAt: new Date(entry.expiresAt).toISOString(),
        });
      }
    }
    return result;
  }
}

const memoryCache = new MemoryCache();

// SlugHelper (SRS FR-CAT-003)
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// In-memory Database Seed for Categories & Recipes
interface CategoryEntity {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
  orderIndex: number;
  createdAt: string;
}

interface RecipeEntity {
  id: string;
  title: string;
  slug: string;
  description: string;
  categoryId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  status: 'Published' | 'Draft' | 'Archived';
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  thumbnailUrl: string;
  createdAt: string;
  viewCount: number;
  likeCount: number;
}

let dbCategories: CategoryEntity[] = [
  {
    id: 'cat-1',
    name: 'Món Chính',
    slug: 'mon-chinh',
    description: 'Các món ăn chính thơm ngon, đậm đà giàu dinh dưỡng cho bữa cơm gia đình Việt.',
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80',
    orderIndex: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-2',
    name: 'Món Canh',
    slug: 'mon-canh',
    description: 'Canh ngọt thanh mát giải nhiệt ngày hè, ấm lòng ngày đông.',
    imageUrl: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80',
    orderIndex: 2,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-3',
    name: 'Bún & Phở',
    slug: 'bun-pho',
    description: 'Tinh hoa ẩm thực truyền thống nước lèo phở bò, bún chả, bún thang...',
    imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=1200&q=80',
    orderIndex: 3,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-4',
    name: 'Tráng Miệng',
    slug: 'trang-mieng',
    description: 'Các món chè bưởi, bánh ngọt, trái cây thanh mát cho kết thúc hoàn hảo.',
    imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=80',
    orderIndex: 4,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cat-5',
    name: 'Đồ Uống & Sinh Tố',
    slug: 'do-uong',
    description: 'Nước ép detox, trà hoa quả tươi mát bổ dưỡng mỗi ngày.',
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
    orderIndex: 5,
    createdAt: new Date().toISOString(),
  },
];

let dbRecipes: RecipeEntity[] = [
  {
    id: 'rcp-1',
    title: 'Phở Bò Tái Lăn Hà Nội Chuẩn Vị',
    slug: 'pho-bo-tai-lan-ha-noi',
    description: 'Bí quyết nấu phở bò tái lăn chuẩn vị truyền thống Hà Thành với nước dùng trong vắt thanh ngọt.',
    categoryId: 'cat-3',
    authorId: 'usr-chef-1',
    authorName: 'Chef Minh Tuấn',
    authorAvatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80',
    status: 'Published',
    difficulty: 'Medium',
    prepTimeMinutes: 30,
    cookTimeMinutes: 180,
    servings: 4,
    thumbnailUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date().toISOString(),
    viewCount: 1420,
    likeCount: 145,
  },
  {
    id: 'rcp-2',
    title: 'Cá Kho Tộ Miền Tây Đậm Đà',
    slug: 'ca-kho-to-mien-tay',
    description: 'Cá bống hoặc cá lóc kho tộ sánh quyện nước màu dừa, tiêu đen thơm lừng.',
    categoryId: 'cat-1',
    authorId: 'usr-chef-1',
    authorName: 'Chef Minh Tuấn',
    authorAvatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80',
    status: 'Published',
    difficulty: 'Easy',
    prepTimeMinutes: 15,
    cookTimeMinutes: 45,
    servings: 4,
    thumbnailUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date().toISOString(),
    viewCount: 890,
    likeCount: 78,
  },
  {
    id: 'rcp-3',
    title: 'Canh Chua Cá Hồi Thanh Mát',
    slug: 'canh-chua-ca-hoi-thanh-mat',
    description: 'Vị chua dịu từ me và cà chua, dứa thơm kết hợp vị béo ngọt của lườn cá hồi.',
    categoryId: 'cat-2',
    authorId: 'usr-chef-2',
    authorName: 'Bếp Trưởng Hoàng Oanh',
    authorAvatar: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=400&q=80',
    status: 'Published',
    difficulty: 'Easy',
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    servings: 4,
    thumbnailUrl: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date().toISOString(),
    viewCount: 650,
    likeCount: 52,
  },
  {
    id: 'rcp-4',
    title: 'Chè Bưởi An Giang Giòn Sần Sật',
    slug: 'che-buoi-an-giang-gion-san-sat',
    description: 'Bí quyết khử đắng cùi bưởi hoàn hảo, cốt dừa béo ngậy đậu xanh mềm mịn.',
    categoryId: 'cat-4',
    authorId: 'usr-chef-2',
    authorName: 'Bếp Trưởng Hoàng Oanh',
    authorAvatar: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=400&q=80',
    status: 'Published',
    difficulty: 'Hard',
    prepTimeMinutes: 60,
    cookTimeMinutes: 40,
    servings: 6,
    thumbnailUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date().toISOString(),
    viewCount: 1120,
    likeCount: 96,
  },
  {
    id: 'rcp-5',
    title: 'Trà Đào Cam Sả Mát Lạnh',
    slug: 'tra-dao-cam-sa-mat-lanh',
    description: 'Thức uống giải khát số 1 cho mùa hè với hương thơm tự nhiên từ sả cây tươi và đào ngâm giòn.',
    categoryId: 'cat-5',
    authorId: 'usr-chef-1',
    authorName: 'Chef Minh Tuấn',
    authorAvatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80',
    status: 'Published',
    difficulty: 'Easy',
    prepTimeMinutes: 10,
    cookTimeMinutes: 5,
    servings: 2,
    thumbnailUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date().toISOString(),
    viewCount: 780,
    likeCount: 64,
  },
  {
    id: 'rcp-6',
    title: 'Bò Kho Nước Dừa Bánh Mì (Bản Nháp)',
    slug: 'bo-kho-nuoc-dua-banh-mi',
    description: 'Công thức đang thử nghiệm định lượng gia vị thảo quả và quế hồi.',
    categoryId: 'cat-1',
    authorId: 'usr-chef-1',
    authorName: 'Chef Minh Tuấn',
    authorAvatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80',
    status: 'Draft',
    difficulty: 'Medium',
    prepTimeMinutes: 20,
    cookTimeMinutes: 60,
    servings: 4,
    thumbnailUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date().toISOString(),
    viewCount: 12,
    likeCount: 2,
  },
];

// Helper to authenticate user from headers or mock
function getAuthUser(req: Request): { id: string; role: 'Guest' | 'Author' | 'Admin'; displayName: string } {
  const authHeader = req.headers.authorization;
  const roleHeader = (req.headers['x-user-role'] as string) || '';
  const userIdHeader = (req.headers['x-user-id'] as string) || '';

  // Check Bearer token or headers
  if (roleHeader === 'Admin' || (authHeader && authHeader.includes('admin'))) {
    return { id: userIdHeader || 'usr-admin-1', role: 'Admin', displayName: 'Hoàng Nam (Admin)' };
  }
  if (roleHeader === 'Author' || (authHeader && authHeader.includes('author')) || (authHeader && authHeader.startsWith('Bearer '))) {
    return { id: userIdHeader || 'usr-chef-1', role: 'Author', displayName: 'Chef Minh Tuấn' };
  }
  return { id: 'guest', role: 'Guest', displayName: 'Khách vãng lai' };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API ROUTE: Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'Healthy',
      timestamp: new Date().toISOString(),
      cache: {
        activeKeys: memoryCache.getEntries().length,
      }
    });
  });

  // ==========================================
  // FR-CAT-001: Xem Danh sách Danh mục
  // GET /api/v1/categories
  // Sắp xếp Name tăng dần, kèm số lượng công thức đã xuất bản (Published).
  // IMemoryCache key: "categories:all" với TTL 60 phút (sliding expiration).
  // ==========================================
  app.get('/api/v1/categories', (req: Request, res: Response) => {
    const cacheKey = 'categories:all';
    const cached = memoryCache.get<any[]>(cacheKey);

    if (cached.hit && cached.data) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-TTL-Remaining', `${cached.ttlRemainingSeconds}s`);
      return res.status(200).json(cached.data);
    }

    // Cache Miss -> Query Database
    // Tính recipeCount chỉ đếm recipes có Status == 'Published'
    const categoryDtos = dbCategories
      .map((cat) => {
        const publishedCount = dbRecipes.filter(
          (r) => r.categoryId === cat.id && r.status === 'Published'
        ).length;
        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          imageUrl: cat.imageUrl,
          recipeCount: publishedCount,
          orderIndex: cat.orderIndex,
        };
      })
      // Sắp xếp theo Name tăng dần
      .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));

    // Lưu vào IMemoryCache với TTL 60 phút (sliding expiration)
    memoryCache.set(cacheKey, categoryDtos, 60);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-TTL-Remaining', '3600s');
    return res.status(200).json(categoryDtos);
  });

  // ==========================================
  // FR-CAT-002: Xem Chi tiết Danh mục và Công thức
  // GET /api/v1/categories/:slug?page=1&pageSize=12
  // Guest chỉ thấy Published; Author thấy thêm Draft của chính mình; Admin thấy tất cả.
  // Phân trang OFFSET-based: SKIP (page-1)*pageSize TAKE pageSize.
  // RFC 7807 problem details nếu 404.
  // ==========================================
  app.get('/api/v1/categories/:slug', (req: Request, res: Response) => {
    const { slug } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, Math.min(50, parseInt(req.query.pageSize as string) || 12));

    // 1. Tìm category theo slug
    const category = dbCategories.find((c) => c.slug === slug);
    if (!category) {
      return res.status(404).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
        title: 'Not Found',
        status: 404,
        detail: `Không tìm thấy danh mục với slug '${slug}'.`,
        instance: `/api/v1/categories/${slug}`,
      });
    }

    // 2. Kiểm tra quyền của currentUser
    const currentUser = getAuthUser(req);

    // 3. Query recipes thuộc category:
    // Guest: Published
    // Author: Published + Draft của chính mình
    // Admin: Tất cả
    const filteredRecipes = dbRecipes.filter((r) => {
      if (r.categoryId !== category.id) return false;
      if (currentUser.role === 'Admin') return true;
      if (currentUser.role === 'Author') {
        return r.status === 'Published' || r.authorId === currentUser.id;
      }
      return r.status === 'Published';
    });

    const totalCount = filteredRecipes.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    // 4. Apply pagination (OFFSET-based: SKIP (page-1)*pageSize TAKE pageSize)
    const skip = (page - 1) * pageSize;
    const paginatedItems = filteredRecipes.slice(skip, skip + pageSize);

    const publishedCount = dbRecipes.filter(
      (r) => r.categoryId === category.id && r.status === 'Published'
    ).length;

    const categoryDto = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      recipeCount: publishedCount,
      orderIndex: category.orderIndex,
    };

    return res.status(200).json({
      category: categoryDto,
      recipes: {
        items: paginatedItems,
        totalCount,
        page,
        pageSize,
        totalPages,
      },
    });
  });

  // ==========================================
  // FR-CAT-003: Tạo Danh mục Mới [Admin]
  // POST /api/v1/categories
  // Header: Authorization: Bearer {adminJwt}
  // Validation: name 2–50 ký tự, không chứa HTML.
  // Slug tự động sinh từ name (slugify); nếu trùng thêm suffix số "-2", "-3"...
  // Invalidate cache: MemoryCache.Remove("categories:all").
  // Response: HTTP 201 Created với CategoryDto và Location header.
  // ==========================================
  app.post('/api/v1/categories', (req: Request, res: Response) => {
    // 1. Kiểm tra role Admin (RequireAuthorization("Admin"))
    const currentUser = getAuthUser(req);
    if (currentUser.role !== 'Admin') {
      return res.status(403).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.3',
        title: 'Forbidden',
        status: 403,
        detail: 'Yêu cầu quyền Quản trị viên (Admin) để thực hiện thao tác tạo danh mục mới.',
        instance: '/api/v1/categories',
      });
    }

    const { name, description, imageUrl } = req.body || {};

    // 2. Validation: name 2–50 ký tự, không chứa HTML
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 50) {
      return res.status(422).json({
        type: 'https://tools.ietf.org/html/rfc4918#section-11.2',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'Dữ liệu không hợp lệ: Tên danh mục (name) phải từ 2 đến 50 ký tự.',
        errors: {
          name: ['Tên danh mục phải có độ dài từ 2 đến 50 ký tự.'],
        },
        instance: '/api/v1/categories',
      });
    }

    const htmlTagRegex = /<[^>]*>/g;
    if (htmlTagRegex.test(name) || (description && htmlTagRegex.test(description))) {
      return res.status(422).json({
        type: 'https://tools.ietf.org/html/rfc4918#section-11.2',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'Dữ liệu không hợp lệ: Tên danh mục và mô tả không được chứa mã HTML độc hại.',
        errors: {
          name: ['Không được chứa thẻ HTML.'],
        },
        instance: '/api/v1/categories',
      });
    }

    const trimmedName = name.trim();

    // 3. Kiểm tra Name chưa tồn tại trong database (409 Conflict)
    const existingName = dbCategories.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingName) {
      return res.status(409).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.8',
        title: 'Conflict',
        status: 409,
        detail: `Tên danh mục '${trimmedName}' đã tồn tại trong hệ thống.`,
        instance: '/api/v1/categories',
      });
    }

    // 4. SlugHelper.Generate(name) tạo slug & Suffix nếu trùng (e.g., "-2", "-3")
    const baseSlug = generateSlug(trimmedName);
    let candidateSlug = baseSlug;
    let suffix = 2;
    while (dbCategories.some((c) => c.slug === candidateSlug)) {
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    // 5. Category.Create entity
    const newCategory: CategoryEntity = {
      id: `cat-${Date.now()}`,
      name: trimmedName,
      slug: candidateSlug,
      description: description ? description.trim() : `Danh mục ${trimmedName} gồm các món ăn chọn lọc.`,
      imageUrl: imageUrl && imageUrl.trim() ? imageUrl.trim() : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80',
      orderIndex: dbCategories.length + 1,
      createdAt: new Date().toISOString(),
    };

    // 6. Add entity
    dbCategories.push(newCategory);

    // 7. MemoryCache.Remove("categories:all") - Invalidate cache
    memoryCache.remove('categories:all');

    const createdDto = {
      id: newCategory.id,
      name: newCategory.name,
      slug: newCategory.slug,
      description: newCategory.description,
      imageUrl: newCategory.imageUrl,
      recipeCount: 0,
      orderIndex: newCategory.orderIndex,
    };

    // 8. Trả về HTTP 201 Created với CategoryDto và Location header
    res.setHeader('Location', `/api/v1/categories/${newCategory.slug}`);
    return res.status(201).json(createdDto);
  });

  // ==========================================
  // Cache Status & Invalidate helper endpoints for UI inspectability
  // ==========================================
  app.get('/api/v1/cache/status', (req: Request, res: Response) => {
    res.json({
      cacheKeys: memoryCache.getEntries(),
    });
  });

  app.post('/api/v1/cache/invalidate', (req: Request, res: Response) => {
    const key = req.body?.key || 'categories:all';
    const removed = memoryCache.remove(key);
    res.json({ success: true, removedKey: key, wasCached: removed });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Culinary Blog Server running on port ${PORT}`);
  });
}

startServer();
