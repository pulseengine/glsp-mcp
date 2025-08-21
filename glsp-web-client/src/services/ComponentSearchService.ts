/**
 * Component Search Service
 *
 * Handles advanced metadata search and filtering with proper client/server architecture.
 * Server-side: Complex queries, full-text search, dependency analysis
 * Client-side: Local filtering, caching, UI state management
 */

import { WasmComponent } from "../types/wasm-component.js";
import { McpService } from "./McpService.js";
import { getService } from "../core/ServiceRegistration.js";

// Advanced search query interface for server-side operations
export interface ComponentSearchQuery {
  // Text search
  text?: string;
  name?: string;
  description?: string;

  // Metadata filters
  category?: string;
  status?: "available" | "loading" | "error" | "loaded" | "unloaded";
  author?: string;
  tags?: string[];

  // Technical filters
  minInterfaces?: number;
  maxInterfaces?: number;
  hasExports?: boolean;
  hasImports?: boolean;

  // Size filters
  minSize?: number; // bytes
  maxSize?: number;

  // Security filters
  securityRisk?: "Low" | "Medium" | "High" | "Critical";
  hasSafetyWarnings?: boolean;

  // Dependency filters
  dependsOn?: string[]; // Component names
  noDependencies?: boolean;
  maxDependencies?: number;

  // Version filters
  version?: string;
  minVersion?: string;

  // Performance filters
  maxLoadTime?: number; // milliseconds

  // Advanced queries
  fullTextSearch?: string; // Server-side indexed search
  similarTo?: string; // Find components similar to this one

  // Pagination and sorting
  limit?: number;
  offset?: number;
  sortBy?:
    | "name"
    | "size"
    | "interfaces"
    | "dependencies"
    | "lastModified"
    | "relevance";
  sortOrder?: "asc" | "desc";
}

// Search result with metadata
export interface ComponentSearchResult {
  component: WasmComponent;
  score?: number; // Relevance score for full-text search
  metadata: {
    size: number;
    interfaces: number;
    dependencies: string[];
    securityRisk: string;
    loadTime?: number;
    lastAnalyzed: number;
  };
  highlights?: {
    field: string;
    text: string;
    positions: { start: number; end: number }[];
  }[];
}

// Search response from server
export interface ComponentSearchResponse {
  results: ComponentSearchResult[];
  total: number;
  query: ComponentSearchQuery;
  executionTime: number;
  suggestions?: string[]; // Search suggestions
}

// Local filter for client-side quick filtering
export interface ComponentLocalFilter {
  search?: string;
  category?: string;
  status?: string;
  tags?: string[];
  quickFilters?: {
    hasErrors?: boolean;
    recentlyUpdated?: boolean;
    frequentlyUsed?: boolean;
    favorites?: boolean;
  };
}

export class ComponentSearchService {
  private mcpService!: McpService;
  private cache = new Map<string, ComponentSearchResponse>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private searchHistory: string[] = [];
  private maxHistorySize = 20;

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    this.mcpService = await getService<McpService>("mcpService");
  }

  /**
   * SERVER-SIDE: Perform advanced search with complex queries
   */
  public async searchComponents(
    query: ComponentSearchQuery,
  ): Promise<ComponentSearchResponse> {
    const cacheKey = this.generateCacheKey(query);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.executionTime < this.cacheTimeout) {
      return cached;
    }

    try {
      // Send complex search query to MCP server
      const response = await this.mcpService.callTool("search_components", {
        query: query,
        includeMetadata: true,
        includeHighlights: !!query.fullTextSearch,
      });

      if (response.success && response.result) {
        const searchResponse = response.result as ComponentSearchResponse;

        // Cache the result
        this.cache.set(cacheKey, {
          ...searchResponse,
          executionTime: Date.now(),
        });

        // Add to search history if it's a text search
        if (query.text || query.fullTextSearch) {
          this.addToSearchHistory(query.text || query.fullTextSearch || "");
        }

        return searchResponse;
      }

      throw new Error("Search failed: " + (response.error || "Unknown error"));
    } catch (error) {
      console.error("Component search failed:", error);

      // Fallback to local search if server is unavailable
      return this.performLocalSearch(query);
    }
  }

  /**
   * CLIENT-SIDE: Quick local filtering of cached components
   */
  public filterComponentsLocally(
    components: WasmComponent[],
    filter: ComponentLocalFilter,
  ): WasmComponent[] {
    let filtered = [...components];

    // Text search (local)
    if (filter.search) {
      const searchTerm = filter.search.toLowerCase();
      filtered = filtered.filter(
        (component) =>
          component.name.toLowerCase().includes(searchTerm) ||
          component.description?.toLowerCase().includes(searchTerm) ||
          component.category?.toLowerCase().includes(searchTerm) ||
          component.interfaces?.some(
            (iface: any) => iface.name?.toLowerCase().includes(searchTerm),
          ),
      );
    }

    // Category filter
    if (filter.category && filter.category !== "all") {
      filtered = filtered.filter(
        (component) => component.category === filter.category,
      );
    }

    // Status filter
    if (filter.status && filter.status !== "all") {
      filtered = filtered.filter(
        (component) => component.status === filter.status,
      );
    }

    // Tags filter
    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter((component) =>
        filter.tags!.some(
          (tag) => (component.metadata as any)?.tags?.includes(tag),
        ),
      );
    }

    // Quick filters
    if (filter.quickFilters) {
      if (filter.quickFilters.hasErrors) {
        filtered = filtered.filter((component) => component.status === "error");
      }

      if (filter.quickFilters.recentlyUpdated) {
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        filtered = filtered.filter(
          (component) => (component.metadata as any)?.lastModified > oneWeekAgo,
        );
      }
    }

    return filtered;
  }

  /**
   * Get search suggestions based on query and history
   */
  public async getSearchSuggestions(query: string): Promise<string[]> {
    const suggestions: string[] = [];

    // Add from search history
    const historySuggestions = this.searchHistory
      .filter((term) => term.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3);
    suggestions.push(...historySuggestions);

    // Get server-side suggestions for advanced queries
    try {
      const response = await this.mcpService.callTool(
        "get_search_suggestions",
        {
          query: query,
          maxSuggestions: 5,
        },
      );

      if (response.success && response.result?.suggestions) {
        suggestions.push(...response.result.suggestions);
      }
    } catch (error) {
      console.warn("Failed to get server suggestions:", error);
    }

    // Remove duplicates and return
    return [...new Set(suggestions)].slice(0, 8);
  }

  /**
   * Debounced search for real-time UI
   */
  public searchWithDebounce(
    query: ComponentSearchQuery,
    callback: (results: ComponentSearchResponse) => void,
    delay: number = 300,
  ): void {
    const queryKey = JSON.stringify(query);

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(queryKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      try {
        const results = await this.searchComponents(query);
        callback(results);
      } catch (error) {
        console.error("Debounced search failed:", error);
      } finally {
        this.debounceTimers.delete(queryKey);
      }
    }, delay);

    this.debounceTimers.set(queryKey, timer);
  }

  /**
   * Get component categories for filter dropdown
   */
  public async getComponentCategories(): Promise<string[]> {
    try {
      const response = await this.mcpService.callTool(
        "get_component_categories",
        {},
      );
      if (response.success && response.result?.categories) {
        return response.result.categories;
      }
    } catch (error) {
      console.warn("Failed to get categories:", error);
    }

    // Fallback to common categories
    return [
      "Sensor",
      "Processing",
      "UI",
      "Communication",
      "Utility",
      "Graphics",
    ];
  }

  /**
   * Get available tags for filtering
   */
  public async getAvailableTags(): Promise<string[]> {
    try {
      const response = await this.mcpService.callTool("get_component_tags", {});
      if (response.success && response.result?.tags) {
        return response.result.tags;
      }
    } catch (error) {
      console.warn("Failed to get tags:", error);
    }

    return [];
  }

  /**
   * Save search preferences
   */
  public saveSearchPreferences(preferences: {
    defaultSortBy?: string;
    defaultSortOrder?: string;
    preferredCategories?: string[];
    searchSettings?: {
      includeMetadata: boolean;
      maxResults: number;
      cacheTimeout: number;
    };
  }): void {
    try {
      localStorage.setItem(
        "componentSearchPreferences",
        JSON.stringify(preferences),
      );
    } catch (error) {
      console.warn("Failed to save search preferences:", error);
    }
  }

  /**
   * Load search preferences
   */
  public loadSearchPreferences(): any {
    try {
      const prefs = localStorage.getItem("componentSearchPreferences");
      return prefs ? JSON.parse(prefs) : null;
    } catch (error) {
      console.warn("Failed to load search preferences:", error);
      return null;
    }
  }

  /**
   * Clear search cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get search statistics
   */
  public getSearchStatistics(): {
    cacheHits: number;
    totalSearches: number;
    averageResponseTime: number;
    historySize: number;
  } {
    // This would be implemented with proper metrics tracking
    return {
      cacheHits: this.cache.size,
      totalSearches: this.searchHistory.length,
      averageResponseTime: 250, // Mock value
      historySize: this.searchHistory.length,
    };
  }

  // Private helper methods

  private generateCacheKey(query: ComponentSearchQuery): string {
    return JSON.stringify(query);
  }

  private addToSearchHistory(term: string): void {
    if (!term.trim()) return;

    // Remove duplicates and add to front
    this.searchHistory = [
      term,
      ...this.searchHistory.filter((t) => t !== term),
    ].slice(0, this.maxHistorySize);
  }

  private async performLocalSearch(
    query: ComponentSearchQuery,
  ): Promise<ComponentSearchResponse> {
    console.warn("Performing local search fallback");

    // This would use a local component registry
    // For now, return empty results
    return {
      results: [],
      total: 0,
      query,
      executionTime: Date.now(),
      suggestions: [],
    };
  }
}

// Export singleton instance
export const componentSearchService = new ComponentSearchService();
