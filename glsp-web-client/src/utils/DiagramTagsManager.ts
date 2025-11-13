/**
 * Diagram Tags Manager
 * Manages tags for diagrams to enable filtering and organization
 */

export interface DiagramTags {
    diagramId: string;
    tags: string[];
}

const STORAGE_KEY = 'glsp-diagram-tags';

export class DiagramTagsManager {
    /**
     * Add tags to a diagram
     */
    public static addTags(diagramId: string, tags: string[]): void {
        const allTags = this.getAllTags();
        const existing = allTags.find(dt => dt.diagramId === diagramId);

        if (existing) {
            // Merge tags (unique)
            existing.tags = [...new Set([...existing.tags, ...tags])];
        } else {
            allTags.push({
                diagramId,
                tags: [...new Set(tags)]
            });
        }

        this.saveTags(allTags);
    }

    /**
     * Remove tags from a diagram
     */
    public static removeTags(diagramId: string, tags: string[]): void {
        const allTags = this.getAllTags();
        const existing = allTags.find(dt => dt.diagramId === diagramId);

        if (existing) {
            existing.tags = existing.tags.filter(tag => !tags.includes(tag));
            // Remove entry if no tags left
            if (existing.tags.length === 0) {
                const filtered = allTags.filter(dt => dt.diagramId !== diagramId);
                this.saveTags(filtered);
            } else {
                this.saveTags(allTags);
            }
        }
    }

    /**
     * Set tags for a diagram (replaces existing)
     */
    public static setTags(diagramId: string, tags: string[]): void {
        const allTags = this.getAllTags();
        const filtered = allTags.filter(dt => dt.diagramId !== diagramId);

        if (tags.length > 0) {
            filtered.push({
                diagramId,
                tags: [...new Set(tags)]
            });
        }

        this.saveTags(filtered);
    }

    /**
     * Get tags for a specific diagram
     */
    public static getTags(diagramId: string): string[] {
        const allTags = this.getAllTags();
        const entry = allTags.find(dt => dt.diagramId === diagramId);
        return entry ? entry.tags : [];
    }

    /**
     * Get all unique tags across all diagrams
     */
    public static getAllUniqueTags(): string[] {
        const allTags = this.getAllTags();
        const tags = allTags.flatMap(dt => dt.tags);
        return [...new Set(tags)].sort();
    }

    /**
     * Get all tags data
     */
    private static getAllTags(): DiagramTags[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return [];
            return JSON.parse(stored);
        } catch (error) {
            console.warn('Failed to load diagram tags:', error);
            return [];
        }
    }

    /**
     * Save tags to localStorage
     */
    private static saveTags(tags: DiagramTags[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
        } catch (error) {
            console.warn('Failed to save diagram tags:', error);
        }
    }

    /**
     * Remove all tags for a diagram
     */
    public static removeAllTags(diagramId: string): void {
        const allTags = this.getAllTags();
        const filtered = allTags.filter(dt => dt.diagramId !== diagramId);
        this.saveTags(filtered);
    }

    /**
     * Find diagrams by tag
     */
    public static findDiagramsByTag(tag: string): string[] {
        const allTags = this.getAllTags();
        return allTags
            .filter(dt => dt.tags.includes(tag))
            .map(dt => dt.diagramId);
    }

    /**
     * Find diagrams by multiple tags (AND logic)
     */
    public static findDiagramsByTags(tags: string[]): string[] {
        if (tags.length === 0) return [];

        const allTags = this.getAllTags();
        return allTags
            .filter(dt => tags.every(tag => dt.tags.includes(tag)))
            .map(dt => dt.diagramId);
    }
}
