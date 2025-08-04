import { SidebarSection } from '../SidebarComponent.js';

export interface Property {
    key: string;
    label: string;
    value: unknown;
    type: 'text' | 'number' | 'boolean' | 'select' | 'color' | 'range';
    options?: Array<{label: string, value: unknown}>;
    min?: number;
    max?: number;
    step?: number;
    readonly?: boolean;
    onChange?: (value: unknown) => void;
}

export interface PropertyGroup {
    id: string;
    label: string;
    properties: Property[];
    collapsed?: boolean;
}

export class PropertiesSection {
    private groups: Map<string, PropertyGroup> = new Map();
    private element?: HTMLElement;
    private selectedObjectId?: string;
    private selectedObjectType?: string;
    
    public setSelectedObject(id: string, type: string): void {
        this.selectedObjectId = id;
        this.selectedObjectType = type;
        this.refresh();
    }
    
    public clearSelection(): void {
        this.selectedObjectId = undefined;
        this.selectedObjectType = undefined;
        this.groups.clear();
        this.refresh();
    }
    
    public addPropertyGroup(group: PropertyGroup): void {
        this.groups.set(group.id, group);
        this.refresh();
    }
    
    public updateProperty(groupId: string, key: string, value: unknown): void {
        const group = this.groups.get(groupId);
        if (group) {
            const property = group.properties.find(p => p.key === key);
            if (property) {
                property.value = value;
                property.onChange?.(value);
                this.refresh();
            }
        }
    }
    
    public createSection(): SidebarSection {
        this.element = this.createContent();
        return {
            id: 'properties',
            title: 'Properties',
            icon: '📝',
            collapsible: true,
            collapsed: false,
            order: 2,
            content: this.element
        };
    }
    
    private createContent(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'properties-container';
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;
        
        if (!this.selectedObjectId) {
            container.innerHTML = `
                <div style="
                    text-align: center;
                    padding: 24px;
                    color: var(--text-secondary, #7D8590);
                    font-size: 14px;
                ">
                    <div style="font-size: 32px; margin-bottom: 8px;">🎯</div>
                    No selection
                </div>
            `;
        } else {
            // Selection header
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 8px;
                background: var(--bg-secondary, #151B2C);
                border-radius: 6px;
                margin-bottom: 4px;
            `;
            header.innerHTML = `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                ">
                    <div>
                        <div style="
                            font-size: 12px;
                            color: var(--text-secondary, #7D8590);
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        ">${this.selectedObjectType}</div>
                        <div style="
                            font-size: 14px;
                            color: var(--text-primary, #E6EDF3);
                            font-weight: 500;
                            margin-top: 2px;
                        ">${this.selectedObjectId}</div>
                    </div>
                    <button style="
                        background: none;
                        border: none;
                        color: var(--text-secondary, #7D8590);
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 4px;
                        transition: all 0.2s ease;
                    " onclick="this.parentElement.parentElement.parentElement.dispatchEvent(new CustomEvent('clear-selection'))">
                        ✕
                    </button>
                </div>
            `;
            container.appendChild(header);
            
            // Property groups
            this.groups.forEach(group => {
                const groupElement = this.createGroupElement(group);
                container.appendChild(groupElement);
            });
        }
        
        // Listen for clear selection
        container.addEventListener('clear-selection', () => this.clearSelection());
        
        return container;
    }
    
    private createGroupElement(group: PropertyGroup): HTMLElement {
        const element = document.createElement('div');
        element.className = 'property-group';
        element.style.cssText = `
            background: var(--bg-secondary, #151B2C);
            border-radius: 6px;
            overflow: hidden;
        `;
        
        // Group header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 10px 12px;
            background: var(--bg-tertiary, #1C2333);
            border-bottom: 1px solid var(--border-color, #2A3441);
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;
        
        header.innerHTML = `
            <span style="
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary, #E6EDF3);
            ">${group.label}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="
                transition: transform 0.3s ease;
                color: var(--text-secondary, #7D8590);
                ${group.collapsed ? 'transform: rotate(-90deg);' : ''}
            ">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
        `;
        
        element.appendChild(header);
        
        // Properties container
        const propertiesContainer = document.createElement('div');
        propertiesContainer.style.cssText = `
            padding: 12px;
            display: ${group.collapsed ? 'none' : 'block'};
        `;
        
        group.properties.forEach(property => {
            const propertyElement = this.createPropertyElement(property, group.id);
            propertiesContainer.appendChild(propertyElement);
        });
        
        element.appendChild(propertiesContainer);
        
        // Toggle collapse
        header.addEventListener('click', () => {
            group.collapsed = !group.collapsed;
            const chevron = header.querySelector('svg') as SVGElement;
            chevron.style.transform = group.collapsed ? 'rotate(-90deg)' : '';
            propertiesContainer.style.display = group.collapsed ? 'none' : 'block';
        });
        
        return element;
    }
    
    private createPropertyElement(property: Property, groupId: string): HTMLElement {
        const element = document.createElement('div');
        element.className = 'property-item';
        element.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            gap: 12px;
        `;
        
        // Label
        const label = document.createElement('label');
        label.textContent = property.label;
        label.style.cssText = `
            font-size: 12px;
            color: var(--text-secondary, #7D8590);
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        element.appendChild(label);
        
        // Value input
        const valueContainer = document.createElement('div');
        valueContainer.style.cssText = `
            flex: 1;
            min-width: 0;
        `;
        
        const input = this.createInput(property, groupId);
        valueContainer.appendChild(input);
        element.appendChild(valueContainer);
        
        return element;
    }
    
    private createInput(property: Property, groupId: string): HTMLElement {
        const baseStyle = `
            width: 100%;
            padding: 6px 10px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 4px;
            color: var(--text-primary, #E6EDF3);
            font-size: 12px;
            transition: all 0.2s ease;
            box-sizing: border-box;
        `;
        
        switch (property.type) {
            case 'text': {
                const input = document.createElement('input');
                input.type = 'text';
                input.value = String(property.value || '');
                input.readOnly = property.readonly || false;
                input.style.cssText = baseStyle;
                
                input.addEventListener('change', (e) => {
                    const value = (e.target as HTMLInputElement).value;
                    this.updateProperty(groupId, property.key, value);
                });
                
                input.addEventListener('focus', () => {
                    input.style.borderColor = 'var(--accent-wasm, #654FF0)';
                });
                
                input.addEventListener('blur', () => {
                    input.style.borderColor = 'var(--border-color, #2A3441)';
                });
                
                return input;
            }
            
            case 'number': {
                const input = document.createElement('input');
                input.type = 'number';
                input.value = property.value?.toString() || '0';
                input.min = property.min?.toString() || '';
                input.max = property.max?.toString() || '';
                input.step = property.step?.toString() || '1';
                input.readOnly = property.readonly || false;
                input.style.cssText = baseStyle;
                
                input.addEventListener('change', (e) => {
                    const value = parseFloat((e.target as HTMLInputElement).value);
                    this.updateProperty(groupId, property.key, value);
                });
                
                return input;
            }
            
            case 'boolean': {
                const label = document.createElement('label');
                label.style.cssText = `
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                `;
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = Boolean(property.value) || false;
                checkbox.disabled = property.readonly || false;
                checkbox.style.cssText = `
                    margin-right: 8px;
                    cursor: pointer;
                `;
                
                checkbox.addEventListener('change', (e) => {
                    const value = (e.target as HTMLInputElement).checked;
                    this.updateProperty(groupId, property.key, value);
                });
                
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(property.value ? 'Yes' : 'No'));
                
                return label;
            }
            
            case 'select': {
                const select = document.createElement('select');
                select.disabled = property.readonly || false;
                select.style.cssText = baseStyle + `cursor: pointer;`;
                
                property.options?.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = String(option.value);
                    optionElement.textContent = option.label;
                    optionElement.selected = option.value === property.value;
                    select.appendChild(optionElement);
                });
                
                select.addEventListener('change', (e) => {
                    const value = (e.target as HTMLSelectElement).value;
                    this.updateProperty(groupId, property.key, value);
                });
                
                return select;
            }
            
            case 'color': {
                const container = document.createElement('div');
                container.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = property.value || '#000000';
                colorInput.disabled = property.readonly || false;
                colorInput.style.cssText = `
                    width: 32px;
                    height: 32px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                `;
                
                const textInput = document.createElement('input');
                textInput.type = 'text';
                textInput.value = property.value || '#000000';
                textInput.readOnly = property.readonly || false;
                textInput.style.cssText = baseStyle + `flex: 1;`;
                
                colorInput.addEventListener('change', (e) => {
                    const value = (e.target as HTMLInputElement).value;
                    textInput.value = value;
                    this.updateProperty(groupId, property.key, value);
                });
                
                textInput.addEventListener('change', (e) => {
                    const value = (e.target as HTMLInputElement).value;
                    colorInput.value = value;
                    this.updateProperty(groupId, property.key, value);
                });
                
                container.appendChild(colorInput);
                container.appendChild(textInput);
                
                return container;
            }
            
            case 'range': {
                const container = document.createElement('div');
                container.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.value = property.value?.toString() || '0';
                slider.min = property.min?.toString() || '0';
                slider.max = property.max?.toString() || '100';
                slider.step = property.step?.toString() || '1';
                slider.disabled = property.readonly || false;
                slider.style.cssText = `flex: 1; cursor: pointer;`;
                
                const valueDisplay = document.createElement('span');
                valueDisplay.textContent = property.value?.toString() || '0';
                valueDisplay.style.cssText = `
                    min-width: 40px;
                    text-align: right;
                    font-size: 12px;
                    color: var(--text-primary, #E6EDF3);
                `;
                
                slider.addEventListener('input', (e) => {
                    const value = parseFloat((e.target as HTMLInputElement).value);
                    valueDisplay.textContent = value.toString();
                    this.updateProperty(groupId, property.key, value);
                });
                
                container.appendChild(slider);
                container.appendChild(valueDisplay);
                
                return container;
            }
            
            default:
                return document.createElement('div');
        }
    }
    
    private refresh(): void {
        if (this.element) {
            const newContent = this.createContent();
            this.element.replaceWith(newContent);
            this.element = newContent;
        }
    }
}