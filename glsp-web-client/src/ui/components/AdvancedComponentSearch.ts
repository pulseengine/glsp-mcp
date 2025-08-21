/**
 * Advanced Component Search UI
 *
 * Comprehensive search interface with:
 * - Real-time search with server/client hybrid approach
 * - Advanced filtering options
 * - Search suggestions and history
 * - Visual feedback and animations
 */

import {
  ComponentSearchService,
  ComponentSearchQuery,
  ComponentSearchResponse,
  ComponentLocalFilter,
  componentSearchService,
} from "../../services/ComponentSearchService.js";
import { animationSystem } from "../../animation/AnimationSystem.js";

export interface AdvancedSearchOptions {
  placeholder?: string;
  showAdvancedFilters?: boolean;
  showQuickFilters?: boolean;
  showSearchHistory?: boolean;
  maxResults?: number;
  onResults?: (results: ComponentSearchResponse) => void;
  onError?: (error: Error) => void;
}

export class AdvancedComponentSearch {
  private container: HTMLElement;
  private searchService: ComponentSearchService;
  private currentQuery: ComponentSearchQuery = {};
  private localFilter: ComponentLocalFilter = {};
  private options: Required<AdvancedSearchOptions>;

  // UI Elements
  private searchInput!: HTMLInputElement;
  private suggestionsDropdown!: HTMLElement;
  private advancedFiltersPanel!: HTMLElement;
  private quickFiltersContainer!: HTMLElement;
  private activeFiltersDisplay!: HTMLElement;
  private resultsContainer!: HTMLElement;
  private searchButton!: HTMLButtonElement;

  // State
  private isAdvancedMode = false;
  private isSearching = false;
  private suggestions: string[] = [];
  private selectedSuggestionIndex = -1;

  constructor(container: HTMLElement, options: AdvancedSearchOptions = {}) {
    this.container = container;
    this.searchService = componentSearchService;

    this.options = {
      placeholder: "Search components...",
      showAdvancedFilters: true,
      showQuickFilters: true,
      showSearchHistory: true,
      maxResults: 50,
      onResults: () => {},
      onError: (error) => console.error("Search error:", error),
      ...options,
    };

    this.initialize();
  }

  private initialize(): void {
    this.createSearchUI();
    this.setupEventListeners();
    this.loadPreferences();

    console.log("🔍 Advanced Component Search initialized");
  }

  private createSearchUI(): void {
    this.container.className = "advanced-component-search";
    this.container.innerHTML = ""; // Clear existing content

    // Apply modern styling
    this.container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
            background: var(--bg-primary, #0F1419);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid var(--border-color, #2A3441);
        `;

    // Search input section
    const searchSection = this.createSearchInputSection();
    this.container.appendChild(searchSection);

    // Quick filters (if enabled)
    if (this.options.showQuickFilters) {
      this.quickFiltersContainer = this.createQuickFilters();
      this.container.appendChild(this.quickFiltersContainer);
    }

    // Advanced filters panel (if enabled)
    if (this.options.showAdvancedFilters) {
      this.advancedFiltersPanel = this.createAdvancedFiltersPanel();
      this.container.appendChild(this.advancedFiltersPanel);
    }

    // Active filters display
    this.activeFiltersDisplay = this.createActiveFiltersDisplay();
    this.container.appendChild(this.activeFiltersDisplay);

    // Search results container
    this.resultsContainer = document.createElement("div");
    this.resultsContainer.className = "search-results";
    this.container.appendChild(this.resultsContainer);
  }

  private createSearchInputSection(): HTMLElement {
    const section = document.createElement("div");
    section.className = "search-input-section";
    section.style.cssText = `
            position: relative;
            display: flex;
            gap: 8px;
        `;

    // Main search input
    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.placeholder = this.options.placeholder;
    this.searchInput.className = "search-input";
    this.searchInput.style.cssText = `
            flex: 1;
            padding: 12px 16px;
            background: var(--bg-secondary, #1A202C);
            border: 2px solid var(--border-color, #2A3441);
            border-radius: 8px;
            color: var(--text-primary, #E6EDF3);
            font-size: 14px;
            transition: all 0.2s ease;
        `;

    // Search button
    this.searchButton = document.createElement("button");
    this.searchButton.innerHTML = "🔍";
    this.searchButton.className = "search-button";
    this.searchButton.style.cssText = `
            padding: 12px 16px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.2s ease;
            min-width: 48px;
        `;

    // Advanced toggle button
    const advancedToggle = document.createElement("button");
    advancedToggle.innerHTML = "⚙️";
    advancedToggle.title = "Advanced Search";
    advancedToggle.className = "advanced-toggle";
    advancedToggle.style.cssText = `
            padding: 12px;
            background: var(--bg-secondary, #1A202C);
            border: 2px solid var(--border-color, #2A3441);
            border-radius: 8px;
            color: var(--text-secondary, #8B949E);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
        `;

    advancedToggle.addEventListener("click", () => this.toggleAdvancedMode());

    // Suggestions dropdown
    this.suggestionsDropdown = document.createElement("div");
    this.suggestionsDropdown.className = "suggestions-dropdown";
    this.suggestionsDropdown.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 48px;
            background: var(--bg-primary, #0F1419);
            border: 2px solid var(--border-color, #2A3441);
            border-top: none;
            border-radius: 0 0 8px 8px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
        `;

    section.appendChild(this.searchInput);
    section.appendChild(this.searchButton);
    if (this.options.showAdvancedFilters) {
      section.appendChild(advancedToggle);
    }
    section.appendChild(this.suggestionsDropdown);

    return section;
  }

  private createQuickFilters(): HTMLElement {
    const container = document.createElement("div");
    container.className = "quick-filters";
    container.style.cssText = `
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            padding: 8px 0;
        `;

    const quickFilters = [
      { key: "hasErrors", label: "❌ Has Errors", color: "#dc3545" },
      {
        key: "recentlyUpdated",
        label: "🆕 Recently Updated",
        color: "#28a745",
      },
      { key: "frequentlyUsed", label: "⭐ Popular", color: "#ffc107" },
      { key: "favorites", label: "❤️ Favorites", color: "#e83e8c" },
    ];

    quickFilters.forEach((filter) => {
      const button = document.createElement("button");
      button.textContent = filter.label;
      button.className = "quick-filter-button";
      button.style.cssText = `
                padding: 6px 12px;
                border: 2px solid ${filter.color}40;
                background: ${filter.color}20;
                color: ${filter.color};
                border-radius: 20px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: all 0.2s ease;
            `;

      button.addEventListener("click", () =>
        this.toggleQuickFilter(
          filter.key as keyof NonNullable<ComponentLocalFilter["quickFilters"]>,
        ),
      );
      container.appendChild(button);
    });

    return container;
  }

  private createAdvancedFiltersPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "advanced-filters-panel";
    panel.style.cssText = `
            display: none;
            background: var(--bg-secondary, #1A202C);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid var(--border-color, #2A3441);
        `;

    // Create filter sections
    const sections = [
      this.createMetadataFilters(),
      this.createTechnicalFilters(),
      this.createSecurityFilters(),
      this.createDependencyFilters(),
    ];

    sections.forEach((section) => panel.appendChild(section));

    return panel;
  }

  private createMetadataFilters(): HTMLElement {
    const section = document.createElement("div");
    section.className = "filter-section";
    section.innerHTML = `
            <h4 style="margin: 0 0 12px 0; color: var(--text-primary, #E6EDF3); font-size: 14px;">📋 Metadata Filters</h4>
            <div class="filter-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Category</label>
                    <select id="category-filter" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                        <option value="">All Categories</option>
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Status</label>
                    <select id="status-filter" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                        <option value="">All Status</option>
                        <option value="available">Available</option>
                        <option value="loading">Loading</option>
                        <option value="error">Error</option>
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Author</label>
                    <input type="text" id="author-filter" placeholder="Component author..." style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                </div>
            </div>
        `;
    return section;
  }

  private createTechnicalFilters(): HTMLElement {
    const section = document.createElement("div");
    section.className = "filter-section";
    section.innerHTML = `
            <h4 style="margin: 16px 0 12px 0; color: var(--text-primary, #E6EDF3); font-size: 14px;">⚙️ Technical Filters</h4>
            <div class="filter-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Min Interfaces</label>
                    <input type="number" id="min-interfaces" min="0" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Max Interfaces</label>
                    <input type="number" id="max-interfaces" min="0" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Min Size (KB)</label>
                    <input type="number" id="min-size" min="0" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Max Size (KB)</label>
                    <input type="number" id="max-size" min="0" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                </div>
            </div>
        `;
    return section;
  }

  private createSecurityFilters(): HTMLElement {
    const section = document.createElement("div");
    section.className = "filter-section";
    section.innerHTML = `
            <h4 style="margin: 16px 0 12px 0; color: var(--text-primary, #E6EDF3); font-size: 14px;">🔒 Security Filters</h4>
            <div class="filter-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Security Risk</label>
                    <select id="security-risk-filter" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                        <option value="">Any Risk Level</option>
                        <option value="Low">Low Risk</option>
                        <option value="Medium">Medium Risk</option>
                        <option value="High">High Risk</option>
                        <option value="Critical">Critical Risk</option>
                    </select>
                </div>
                <div>
                    <label style="display: flex; align-items: center; gap: 8px; margin-top: 20px; color: var(--text-secondary, #8B949E); font-size: 12px;">
                        <input type="checkbox" id="has-safety-warnings">
                        Has Safety Warnings
                    </label>
                </div>
            </div>
        `;
    return section;
  }

  private createDependencyFilters(): HTMLElement {
    const section = document.createElement("div");
    section.className = "filter-section";
    section.innerHTML = `
            <h4 style="margin: 16px 0 12px 0; color: var(--text-primary, #E6EDF3); font-size: 14px;">🔗 Dependency Filters</h4>
            <div class="filter-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Depends On</label>
                    <input type="text" id="depends-on-filter" placeholder="component1, component2..." style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text-secondary, #8B949E); font-size: 12px;">Max Dependencies</label>
                    <input type="number" id="max-dependencies" min="0" style="width: 100%; padding: 6px; background: var(--bg-primary, #0F1419); border: 1px solid var(--border-color, #2A3441); border-radius: 4px; color: var(--text-primary, #E6EDF3);">
                </div>
                <div>
                    <label style="display: flex; align-items: center; gap: 8px; margin-top: 20px; color: var(--text-secondary, #8B949E); font-size: 12px;">
                        <input type="checkbox" id="no-dependencies">
                        No Dependencies Only
                    </label>
                </div>
            </div>
        `;
    return section;
  }

  private createActiveFiltersDisplay(): HTMLElement {
    const display = document.createElement("div");
    display.className = "active-filters";
    display.style.cssText = `
            display: none;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px 0;
        `;
    return display;
  }

  private setupEventListeners(): void {
    // Search input events
    this.searchInput.addEventListener("input", (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.handleSearchInput(query);
    });

    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.performSearch();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        this.handleSuggestionNavigation(e.key);
        e.preventDefault();
      } else if (e.key === "Escape") {
        this.hideSuggestions();
      }
    });

    // Search button
    this.searchButton.addEventListener("click", () => this.performSearch());

    // Advanced filter inputs
    if (this.options.showAdvancedFilters) {
      this.setupAdvancedFilterListeners();
    }
  }

  private setupAdvancedFilterListeners(): void {
    const filterInputs =
      this.advancedFiltersPanel.querySelectorAll("input, select");

    filterInputs.forEach((input) => {
      input.addEventListener("change", () => {
        this.updateQueryFromAdvancedFilters();
      });
    });
  }

  private async handleSearchInput(query: string): Promise<void> {
    this.localFilter.search = query;

    if (query.length > 2) {
      // Get suggestions
      this.suggestions = await this.searchService.getSearchSuggestions(query);
      this.showSuggestions();
    } else {
      this.hideSuggestions();
    }

    // Perform local filtering for instant feedback
    this.performLocalFiltering();
  }

  private showSuggestions(): void {
    if (this.suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.suggestionsDropdown.innerHTML = "";

    this.suggestions.forEach((suggestion, index) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.textContent = suggestion;
      item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                color: var(--text-secondary, #8B949E);
                font-size: 14px;
                border-bottom: 1px solid var(--border-color, #2A3441);
            `;

      item.addEventListener("click", () => {
        this.searchInput.value = suggestion;
        this.hideSuggestions();
        this.performSearch();
      });

      item.addEventListener("mouseenter", () => {
        this.selectedSuggestionIndex = index;
        this.updateSuggestionSelection();
      });

      this.suggestionsDropdown.appendChild(item);
    });

    this.suggestionsDropdown.style.display = "block";
    this.selectedSuggestionIndex = -1;
  }

  private hideSuggestions(): void {
    this.suggestionsDropdown.style.display = "none";
    this.selectedSuggestionIndex = -1;
  }

  private handleSuggestionNavigation(key: string): void {
    if (this.suggestions.length === 0) return;

    if (key === "ArrowDown") {
      this.selectedSuggestionIndex = Math.min(
        this.selectedSuggestionIndex + 1,
        this.suggestions.length - 1,
      );
    } else if (key === "ArrowUp") {
      this.selectedSuggestionIndex = Math.max(
        this.selectedSuggestionIndex - 1,
        -1,
      );
    }

    this.updateSuggestionSelection();

    if (this.selectedSuggestionIndex >= 0) {
      this.searchInput.value = this.suggestions[this.selectedSuggestionIndex];
    }
  }

  private updateSuggestionSelection(): void {
    const items = this.suggestionsDropdown.querySelectorAll(".suggestion-item");
    items.forEach((item, index) => {
      if (index === this.selectedSuggestionIndex) {
        (item as HTMLElement).style.background =
          "var(--accent-hover, #667eea40)";
      } else {
        (item as HTMLElement).style.background = "";
      }
    });
  }

  private toggleAdvancedMode(): void {
    this.isAdvancedMode = !this.isAdvancedMode;

    if (this.isAdvancedMode) {
      this.advancedFiltersPanel.style.display = "block";
      animationSystem.animate(this.advancedFiltersPanel, {
        type: "slideDown",
        duration: 300,
        easing: "ease-out",
      });
    } else {
      animationSystem
        .animate(this.advancedFiltersPanel, {
          type: "slideUp",
          duration: 300,
          easing: "ease-in",
        })
        .then(() => {
          this.advancedFiltersPanel.style.display = "none";
        });
    }
  }

  private toggleQuickFilter(
    filterKey: keyof NonNullable<ComponentLocalFilter["quickFilters"]>,
  ): void {
    if (!this.localFilter.quickFilters) {
      this.localFilter.quickFilters = {};
    }

    const quickFilters = this.localFilter.quickFilters as Record<
      string,
      boolean
    >;
    quickFilters[filterKey] = !quickFilters[filterKey];
    this.updateActiveFiltersDisplay();
    this.performLocalFiltering();
  }

  private updateQueryFromAdvancedFilters(): void {
    // Extract values from advanced filter inputs
    const categorySelect = this.advancedFiltersPanel.querySelector(
      "#category-filter",
    ) as HTMLSelectElement;
    const statusSelect = this.advancedFiltersPanel.querySelector(
      "#status-filter",
    ) as HTMLSelectElement;
    // ... extract other filter values

    // Update query object
    this.currentQuery.category = categorySelect?.value || undefined;
    this.currentQuery.status = (statusSelect?.value as any) || undefined;
    // ... set other query properties

    this.updateActiveFiltersDisplay();
  }

  private updateActiveFiltersDisplay(): void {
    // Show/hide active filters display
    const hasFilters =
      Object.keys(this.currentQuery).length > 0 ||
      Object.keys(this.localFilter).some((key) => key !== "search");

    if (hasFilters) {
      this.activeFiltersDisplay.style.display = "flex";
      // Create filter pills here
    } else {
      this.activeFiltersDisplay.style.display = "none";
    }
  }

  private async performSearch(): Promise<void> {
    if (this.isSearching) return;

    this.isSearching = true;
    this.searchButton.innerHTML = "⏳";
    this.searchButton.disabled = true;

    try {
      // Build query
      const query: ComponentSearchQuery = {
        ...this.currentQuery,
        fullTextSearch: this.searchInput.value,
        limit: this.options.maxResults,
      };

      // Perform server-side search
      const response = await this.searchService.searchComponents(query);

      // Display results
      this.displayResults(response);

      // Notify callback
      this.options.onResults(response);
    } catch (error) {
      console.error("Search failed:", error);
      this.options.onError(error as Error);
    } finally {
      this.isSearching = false;
      this.searchButton.innerHTML = "🔍";
      this.searchButton.disabled = false;
      this.hideSuggestions();
    }
  }

  private performLocalFiltering(): void {
    // This would filter local components if we have them
    // Implementation depends on how components are stored locally
    console.log("Performing local filtering:", this.localFilter);
  }

  private displayResults(response: ComponentSearchResponse): void {
    this.resultsContainer.innerHTML = "";

    if (response.results.length === 0) {
      this.resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 24px; color: var(--text-secondary, #8B949E);">
                    <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                    <div>No components found matching your criteria</div>
                    ${
                      response.suggestions && response.suggestions.length > 0
                        ? `<div style="margin-top: 12px;">Try: ${response.suggestions.join(
                            ", ",
                          )}</div>`
                        : ""
                    }
                </div>
            `;
      return;
    }

    // Display search statistics
    const stats = document.createElement("div");
    stats.style.cssText = `
            padding: 8px 0;
            color: var(--text-secondary, #8B949E);
            font-size: 12px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            margin-bottom: 12px;
        `;
    stats.innerHTML = `Found ${response.total} components in ${response.executionTime}ms`;
    this.resultsContainer.appendChild(stats);

    // Display results
    response.results.forEach((result, index) => {
      const resultElement = this.createResultElement(result, index);
      this.resultsContainer.appendChild(resultElement);
    });
  }

  private createResultElement(result: any, _index: number): HTMLElement {
    const element = document.createElement("div");
    element.className = "search-result";
    element.style.cssText = `
            background: var(--bg-secondary, #1A202C);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            border: 1px solid var(--border-color, #2A3441);
            transition: all 0.2s ease;
            cursor: pointer;
        `;

    element.innerHTML = `
            <div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 8px;">
                <h4 style="margin: 0; color: var(--text-primary, #E6EDF3); font-size: 16px;">
                    ${result.component.name}
                </h4>
                <span style="color: var(--accent-wasm, #654FF0); font-size: 12px; background: var(--accent-wasm)20; padding: 2px 6px; border-radius: 4px;">
                    ${result.component.category || "Unknown"}
                </span>
            </div>
            <p style="margin: 0 0 12px 0; color: var(--text-secondary, #8B949E); font-size: 14px; line-height: 1.4;">
                ${result.component.description || "No description available"}
            </p>
            <div style="display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary, #8B949E);">
                <span>📊 ${result.metadata.interfaces} interfaces</span>
                <span>📦 ${this.formatFileSize(result.metadata.size)}</span>
                <span>🔗 ${result.metadata.dependencies.length} deps</span>
                ${
                  result.score
                    ? `<span>🎯 ${Math.round(result.score * 100)}% match</span>`
                    : ""
                }
            </div>
        `;

    // Add hover animations
    element.addEventListener("mouseenter", () => {
      animationSystem.animate(element, {
        type: "lift",
        duration: 200,
        easing: "ease-out",
      });
    });

    element.addEventListener("mouseleave", () => {
      element.style.transform = "";
    });

    return element;
  }

  private loadPreferences(): void {
    const preferences = this.searchService.loadSearchPreferences();
    if (preferences) {
      // Apply loaded preferences to UI
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  // Public API methods

  public clearSearch(): void {
    this.searchInput.value = "";
    this.currentQuery = {};
    this.localFilter = {};
    this.resultsContainer.innerHTML = "";
    this.updateActiveFiltersDisplay();
  }

  public setQuery(query: ComponentSearchQuery): void {
    this.currentQuery = query;
    if (query.fullTextSearch) {
      this.searchInput.value = query.fullTextSearch;
    }
    this.updateActiveFiltersDisplay();
  }

  public getQuery(): ComponentSearchQuery {
    return { ...this.currentQuery };
  }

  public destroy(): void {
    // Clean up event listeners and timers
    this.searchService.clearCache();
    this.container.innerHTML = "";
  }
}
