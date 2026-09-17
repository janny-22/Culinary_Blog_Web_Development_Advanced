namespace CulinaryBlog.Domain.Interfaces;

public interface ICategoryRepository
{
    Task<IReadOnlyList<(Category Category, int PublishedRecipeCount)>> GetAllWithRecipeCountAsync(CancellationToken ct = default);
    Task<Category?> GetBySlugAsync(string slug, CancellationToken ct = default);
    Task<bool> ExistsByNameAsync(string name, CancellationToken ct = default);
    Task<bool> ExistsBySlugAsync(string slug, CancellationToken ct = default);
    Task AddAsync(Category category, CancellationToken ct = default);
}

public interface IUnitOfWork : IDisposable
{
    ICategoryRepository Categories { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
