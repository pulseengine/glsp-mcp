/**
 * Favorite Diagrams Manager
 * Manages pinned/favorited diagrams for quick access
 */

export interface FavoriteDiagram {
    id: string;
    name: string;
    diagramType: string;
    favoritedAt: number; // timestamp
}

const STORAGE_KEY = 'glsp-favorite-diagrams';

export class FavoriteDiagramsManager {
    /**
     * Add a diagram to favorites
     */
    public static addFavorite(diagram: { id: string; name: string; diagramType: string }): void {
        const favorites = this.getFavorites();

        // Check if already favorited
        if (favorites.some(d => d.id === diagram.id)) {
            return;
        }

        // Add to favorites
        const updated: FavoriteDiagram[] = [
            ...favorites,
            {
                ...diagram,
                favoritedAt: Date.now()
            }
        ];

        // Save to localStorage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
            console.warn('Failed to save favorite diagrams:', error);
        }
    }

    /**
     * Get all favorite diagrams, sorted by most recently favorited first
     */
    public static getFavorites(): FavoriteDiagram[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return [];

            const favorites: FavoriteDiagram[] = JSON.parse(stored);

            // Sort by favoritedAt descending
            return favorites.sort((a, b) => b.favoritedAt - a.favoritedAt);
        } catch (error) {
            console.warn('Failed to load favorite diagrams:', error);
            return [];
        }
    }

    /**
     * Remove a diagram from favorites
     */
    public static removeFavorite(diagramId: string): void {
        const favorites = this.getFavorites();
        const updated = favorites.filter(d => d.id !== diagramId);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
            console.warn('Failed to update favorite diagrams:', error);
        }
    }

    /**
     * Toggle favorite status
     */
    public static toggleFavorite(diagram: { id: string; name: string; diagramType: string }): boolean {
        if (this.isFavorite(diagram.id)) {
            this.removeFavorite(diagram.id);
            return false;
        } else {
            this.addFavorite(diagram);
            return true;
        }
    }

    /**
     * Check if a diagram is favorited
     */
    public static isFavorite(diagramId: string): boolean {
        const favorites = this.getFavorites();
        return favorites.some(d => d.id === diagramId);
    }

    /**
     * Clear all favorites
     */
    public static clearFavorites(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.warn('Failed to clear favorite diagrams:', error);
        }
    }
}
