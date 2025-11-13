/**
 * Recent Diagrams Manager
 * Tracks recently accessed diagrams for quick access
 */

export interface RecentDiagram {
    id: string;
    name: string;
    diagramType: string;
    lastAccessed: number; // timestamp
}

const STORAGE_KEY = 'glsp-recent-diagrams';
const MAX_RECENT = 10;

export class RecentDiagramsManager {
    /**
     * Add a diagram to recent list
     */
    public static addRecent(diagram: { id: string; name: string; diagramType: string }): void {
        const recent = this.getRecent();

        // Remove if already exists (to update timestamp)
        const filtered = recent.filter(d => d.id !== diagram.id);

        // Add to front
        const updated: RecentDiagram[] = [
            {
                ...diagram,
                lastAccessed: Date.now()
            },
            ...filtered
        ].slice(0, MAX_RECENT); // Keep only MAX_RECENT items

        // Save to localStorage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
            console.warn('Failed to save recent diagrams:', error);
        }
    }

    /**
     * Get all recent diagrams, sorted by most recent first
     */
    public static getRecent(): RecentDiagram[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return [];

            const recent: RecentDiagram[] = JSON.parse(stored);

            // Sort by lastAccessed descending
            return recent.sort((a, b) => b.lastAccessed - a.lastAccessed);
        } catch (error) {
            console.warn('Failed to load recent diagrams:', error);
            return [];
        }
    }

    /**
     * Remove a diagram from recent list
     */
    public static removeRecent(diagramId: string): void {
        const recent = this.getRecent();
        const updated = recent.filter(d => d.id !== diagramId);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
            console.warn('Failed to update recent diagrams:', error);
        }
    }

    /**
     * Clear all recent diagrams
     */
    public static clearRecent(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.warn('Failed to clear recent diagrams:', error);
        }
    }

    /**
     * Get formatted time ago string
     */
    public static getTimeAgo(timestamp: number): string {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return `${Math.floor(seconds / 604800)}w ago`;
    }
}
