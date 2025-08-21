/**
 * UML Component Renderer - Professional UML-style diagram rendering
 * Implements proper UML conventions for class and component diagrams
 */

import { Bounds, ModelElement } from "../model/diagram.js";

// UML-specific interfaces
interface UMLComponentInterface {
  name: string;
  type: "provided" | "required"; // UML component interface types
  visibility?: "public" | "private" | "protected" | "package";
  stereotype?: string;
  methods?: UMLMethod[];
}

interface UMLMethod {
  name: string;
  visibility: "public" | "private" | "protected" | "package";
  returnType?: string;
  parameters?: UMLParameter[];
  isStatic?: boolean;
  isAbstract?: boolean;
}

interface UMLParameter {
  name: string;
  type: string;
  defaultValue?: string;
}

interface UMLAttribute {
  name: string;
  type: string;
  visibility: "public" | "private" | "protected" | "package";
  isStatic?: boolean;
  defaultValue?: string;
}

export interface UMLRenderingStyle {
  primaryColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  secondaryTextColor: string;
  compartmentLineColor: string;
  interfaceColor: string;
  selectedColor: string;
  fontFamily: string;
  fontSize: number;
  headerFontSize: number;
  lineHeight: number;
  padding: number;
  compartmentPadding: number;
  borderWidth: number;
  cornerRadius: number;
}

export interface UMLRenderingContext {
  ctx: CanvasRenderingContext2D;
  scale: number;
  isSelected: boolean;
  isHovered: boolean;
  style: UMLRenderingStyle;
  renderMode: "class" | "component" | "interface";
  showStereotypes: boolean;
  showVisibility: boolean;
  showMethodSignatures: boolean;
}

export class UMLComponentRenderer {
  // UML standard dimensions and spacing
  private static readonly MIN_WIDTH = 250;
  private static readonly MIN_HEIGHT = 150;
  // private static readonly __COMPARTMENT_MIN_HEIGHT = 25; // Unused
  private static readonly INTERFACE_RADIUS = 8;
  private static readonly INTERFACE_SPACING = 20;
  private static readonly TEXT_MARGIN = 12;
  // private static readonly __LINE_SPACING = 18; // Unused

  // UML visibility symbols
  private static readonly VISIBILITY_SYMBOLS = {
    public: "+",
    private: "-",
    protected: "#",
    package: "~",
  };

  // Default UML styling
  private static readonly DEFAULT_STYLE: UMLRenderingStyle = {
    primaryColor: "#2D3748",
    backgroundColor: "#FFFFFF",
    borderColor: "#4A5568",
    textColor: "#1A202C",
    secondaryTextColor: "#4A5568",
    compartmentLineColor: "#CBD5E0",
    interfaceColor: "#3182CE",
    selectedColor: "#3182CE",
    fontFamily: "Arial, sans-serif",
    fontSize: 12,
    headerFontSize: 14,
    lineHeight: 1.4,
    padding: 12,
    compartmentPadding: 8,
    borderWidth: 1,
    cornerRadius: 4,
  };

  static renderUMLComponent(
    element: ModelElement,
    bounds: Bounds,
    context: UMLRenderingContext,
  ): void {
    const elementType = element.type || element.element_type;

    // Handle different UML element types
    if (elementType === "uml-interface") {
      this.renderUMLInterface(element, bounds, context);
      return;
    }

    // Handle main component rendering
    const { ctx, isSelected, style, renderMode } = context;
    const finalStyle = { ...this.DEFAULT_STYLE, ...style };

    // Get component data (simplified for main component)
    const componentName = this.getComponentName(element);
    const stereotype = this.getStereotype(element, renderMode);
    const attributes = this.getMainComponentAttributes(element);
    const methods = this.getMethods(element); // Get methods for complete UML rendering
    const interfaces = this.__getInterfaces(element); // Get interfaces from element properties

    // Calculate compartment dimensions
    const compartments = this.calculateCompartments(
      componentName,
      stereotype,
      attributes,
      methods,
      interfaces,
      bounds,
      finalStyle,
      context,
    );

    // Draw main component box
    this.drawComponentBox(bounds, isSelected, finalStyle, ctx);

    // Draw compartments
    let currentY = bounds.y;

    // Header compartment (name + stereotype)
    if (compartments.header.height > 0) {
      this.drawHeaderCompartment(
        bounds.x,
        currentY,
        bounds.width,
        compartments.header.height,
        componentName,
        stereotype,
        finalStyle,
        context,
      );
      currentY += compartments.header.height;
    }

    // Attributes compartment (simplified component info)
    if (compartments.attributes.height > 0) {
      this.drawCompartmentSeparator(
        bounds.x,
        currentY,
        bounds.width,
        finalStyle,
        ctx,
      );
      this.drawAttributesCompartment(
        bounds.x,
        currentY,
        bounds.width,
        compartments.attributes.height,
        attributes,
        finalStyle,
        context,
      );
      currentY += compartments.attributes.height;
    }

    // Methods compartment (if any methods exist)
    if (compartments.methods && compartments.methods.height > 0) {
      this.drawCompartmentSeparator(
        bounds.x,
        currentY,
        bounds.width,
        finalStyle,
        ctx,
      );
      this.__drawMethodsCompartment(
        bounds.x,
        currentY,
        bounds.width,
        compartments.methods.height,
        methods,
        finalStyle,
        context,
      );
      currentY += compartments.methods.height;
    }

    // Draw component interfaces (lollipops and sockets)
    if (interfaces.length > 0) {
      this.__drawComponentInterfaces(bounds, interfaces, finalStyle, context);
    }
  }

  static renderUMLInterface(
    element: ModelElement,
    bounds: Bounds,
    context: UMLRenderingContext,
  ): void {
    const { ctx, isSelected, style } = context;
    const finalStyle = { ...this.DEFAULT_STYLE, ...style };

    // Get interface data
    const interfaceName = element.label?.toString() || "Interface";
    const interfaceType =
      element.properties?.interfaceType?.toString() || "export";
    const functions = Array.isArray(element.properties?.functions)
      ? element.properties.functions
      : [];

    // Interface styling
    const interfaceStyle = {
      ...finalStyle,
      backgroundColor: interfaceType === "export" ? "#E6F3FF" : "#FFF3E6",
      borderColor: interfaceType === "export" ? "#3182CE" : "#DD6B20",
      primaryColor: interfaceType === "export" ? "#3182CE" : "#DD6B20",
    };

    // Draw interface box
    this.drawInterfaceBox(
      bounds,
      isSelected,
      interfaceStyle,
      ctx,
      interfaceType,
    );

    // Draw interface header
    let currentY = bounds.y;
    const headerHeight = 40;
    this.drawInterfaceHeader(
      bounds.x,
      currentY,
      bounds.width,
      headerHeight,
      interfaceName,
      interfaceType,
      interfaceStyle,
      context,
    );
    currentY += headerHeight;

    // Draw functions if any
    if (functions.length > 0) {
      this.drawCompartmentSeparator(
        bounds.x,
        currentY,
        bounds.width,
        interfaceStyle,
        ctx,
      );
      const methodsHeight = functions.length * 18 + 16;
      this.drawInterfaceFunctions(
        bounds.x,
        currentY,
        bounds.width,
        methodsHeight,
        functions,
        interfaceStyle,
        context,
      );
    }
  }

  private static getComponentName(element: ModelElement): string {
    return (
      element.label?.toString() ||
      element.properties?.label?.toString() ||
      element.properties?.componentName?.toString() ||
      "Component"
    );
  }

  private static getStereotype(
    element: ModelElement,
    renderMode: string,
  ): string | undefined {
    const explicitStereotype = element.properties?.stereotype?.toString();
    if (explicitStereotype) return explicitStereotype;

    // Default stereotypes based on render mode
    switch (renderMode) {
      case "component":
        return "component";
      case "interface":
        return "interface";
      default:
        return undefined;
    }
  }

  private static getAttributes(element: ModelElement): UMLAttribute[] {
    const attrs: UMLAttribute[] = [];

    // Add component properties as attributes
    const properties = element.properties || {};

    // Add important component metadata as attributes
    if (properties.category) {
      attrs.push({
        name: "category",
        type: "string",
        visibility: "public",
        isStatic: true,
        defaultValue: `"${properties.category}"`,
      });
    }

    if (properties.status) {
      attrs.push({
        name: "status",
        type: "ComponentStatus",
        visibility: "public",
        defaultValue: `"${properties.status}"`,
      });
    }

    if (properties.componentPath) {
      attrs.push({
        name: "componentPath",
        type: "string",
        visibility: "private",
        defaultValue: "...",
      });
    }

    // Add interface count as a readable attribute
    const interfaces = properties.interfaces || [];
    if (Array.isArray(interfaces) && interfaces.length > 0) {
      const importCount = interfaces.filter(
        (i) => i.interface_type === "import",
      ).length;
      const exportCount = interfaces.filter(
        (i) => i.interface_type === "export",
      ).length;

      attrs.push({
        name: "importInterfaces",
        type: "number",
        visibility: "public",
        isStatic: true,
        defaultValue: importCount.toString(),
      });

      attrs.push({
        name: "exportInterfaces",
        type: "number",
        visibility: "public",
        isStatic: true,
        defaultValue: exportCount.toString(),
      });
    }

    // Add explicit attributes if defined
    const explicitAttrs = properties.attributes || [];
    if (Array.isArray(explicitAttrs)) {
      explicitAttrs.forEach((attr) => {
        attrs.push({
          name: attr.name || "attribute",
          type: attr.type || "any",
          visibility: attr.visibility || "public",
          isStatic: attr.isStatic || false,
          defaultValue: attr.defaultValue,
        });
      });
    }

    return attrs;
  }

  private static getMainComponentAttributes(
    element: ModelElement,
  ): UMLAttribute[] {
    const attrs: UMLAttribute[] = [];
    const properties = element.properties || {};

    // Simplified main component attributes - just essential info
    if (properties.category) {
      attrs.push({
        name: "category",
        type: "string",
        visibility: "public",
        isStatic: true,
        defaultValue: `"${properties.category}"`,
      });
    }

    if (properties.status) {
      attrs.push({
        name: "status",
        type: "ComponentStatus",
        visibility: "public",
        defaultValue: `"${properties.status}"`,
      });
    }

    return attrs;
  }

  private static getMethods(element: ModelElement): UMLMethod[] {
    const methods: UMLMethod[] = [];

    // Extract methods from WASM component interfaces
    const interfaces = element.properties?.interfaces || [];
    if (Array.isArray(interfaces)) {
      interfaces.forEach((iface) => {
        const functions = iface.functions || [];
        functions.forEach((func: any) => {
          const parameters: UMLParameter[] = (func.params || []).map(
            (param: any) => ({
              name: param.name || "param",
              type: param.param_type || "unknown",
            }),
          );

          const returnType =
            func.returns && func.returns.length > 0
              ? func.returns[0].param_type || "unknown"
              : "void";

          const visibility =
            iface.interface_type === "export" ? "public" : "private";

          methods.push({
            name: func.name || "function",
            visibility,
            returnType,
            parameters,
            isStatic: false,
            isAbstract: false,
          });
        });
      });
    }

    // Fallback to explicit methods if no interfaces found
    const explicitMethods = element.properties?.methods || [];
    if (Array.isArray(explicitMethods)) {
      explicitMethods.forEach((method) => {
        methods.push({
          name: method.name || "method",
          visibility: method.visibility || "public",
          returnType: method.returnType || "void",
          parameters: method.parameters || [],
          isStatic: method.isStatic || false,
          isAbstract: method.isAbstract || false,
        });
      });
    }

    return methods;
  }

  private static __getInterfaces(
    element: ModelElement,
  ): UMLComponentInterface[] {
    const interfaces = element.properties?.interfaces || [];
    if (Array.isArray(interfaces)) {
      return interfaces.map((iface) => ({
        name: iface.name || "interface",
        type: iface.interface_type === "export" ? "provided" : "required",
        visibility: iface.visibility || "public",
        stereotype: iface.stereotype,
        methods: iface.methods || [],
      }));
    }
    return [];
  }

  private static calculateCompartments(
    _componentName: string,
    stereotype: string | undefined,
    attributes: UMLAttribute[],
    methods: UMLMethod[],
    _interfaces: UMLComponentInterface[],
    _bounds: Bounds,
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ) {
    const { ctx } = context;
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;

    // Header compartment (name + stereotype)
    let headerHeight = style.compartmentPadding * 2;
    if (stereotype) {
      headerHeight += style.lineHeight * style.fontSize;
    }
    headerHeight += style.headerFontSize * style.lineHeight;

    // Attributes compartment
    let attributesHeight = 0;
    if (attributes.length > 0) {
      attributesHeight =
        style.compartmentPadding * 2 +
        attributes.length * style.lineHeight * style.fontSize;
    }

    // Methods compartment
    let methodsHeight = 0;
    if (methods.length > 0) {
      methodsHeight =
        style.compartmentPadding * 2 +
        methods.length * style.lineHeight * style.fontSize;
    }

    return {
      header: { height: headerHeight },
      attributes: { height: attributesHeight },
      methods: { height: methodsHeight },
    };
  }

  private static drawComponentBox(
    bounds: Bounds,
    isSelected: boolean,
    style: UMLRenderingStyle,
    ctx: CanvasRenderingContext2D,
  ): void {
    // Set styles
    ctx.fillStyle = style.backgroundColor;
    ctx.strokeStyle = isSelected ? style.selectedColor : style.borderColor;
    ctx.lineWidth = isSelected ? style.borderWidth * 2 : style.borderWidth;

    // Draw rounded rectangle
    this.drawRoundedRect(
      ctx,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      style.cornerRadius,
    );
    ctx.fill();
    ctx.stroke();
  }

  private static drawHeaderCompartment(
    x: number,
    y: number,
    width: number,
    _height: number,
    componentName: string,
    stereotype: string | undefined,
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ): void {
    const { ctx } = context;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let textY = y + style.compartmentPadding;

    // Draw stereotype if present
    if (stereotype && context.showStereotypes) {
      ctx.font = `${style.fontSize}px ${style.fontFamily}`;
      ctx.fillStyle = style.secondaryTextColor;
      ctx.fillText(
        `«${stereotype}»`,
        x + width / 2,
        textY + style.fontSize / 2,
      );
      textY += style.lineHeight * style.fontSize;
    }

    // Draw component name
    ctx.font = `bold ${style.headerFontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.textColor;
    ctx.fillText(
      componentName,
      x + width / 2,
      textY + style.headerFontSize / 2,
    );
  }

  private static drawAttributesCompartment(
    x: number,
    y: number,
    _width: number,
    _height: number,
    attributes: UMLAttribute[],
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ): void {
    const { ctx } = context;
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    let textY = y + style.compartmentPadding + style.fontSize / 2;

    attributes.forEach((attr) => {
      const visibilitySymbol = context.showVisibility
        ? this.VISIBILITY_SYMBOLS[attr.visibility] + " "
        : "";
      const staticModifier = attr.isStatic ? "{static} " : "";
      const attributeText = `${visibilitySymbol}${staticModifier}${attr.name}: ${attr.type}`;

      ctx.fillText(attributeText, x + this.TEXT_MARGIN, textY);
      textY += style.lineHeight * style.fontSize;
    });
  }

  private static __drawMethodsCompartment(
    x: number,
    y: number,
    _width: number,
    _height: number,
    methods: UMLMethod[],
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ): void {
    const { ctx } = context;
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    let textY = y + style.compartmentPadding + style.fontSize / 2;

    methods.forEach((method) => {
      const visibilitySymbol = context.showVisibility
        ? this.VISIBILITY_SYMBOLS[method.visibility] + " "
        : "";
      const staticModifier = method.isStatic ? "{static} " : "";
      const abstractModifier = method.isAbstract ? "{abstract} " : "";

      let methodText = `${visibilitySymbol}${staticModifier}${abstractModifier}${method.name}`;

      if (context.showMethodSignatures && method.parameters) {
        const params = method.parameters
          .map((p) => `${p.name}: ${p.type}`)
          .join(", ");
        methodText += `(${params})`;
        if (method.returnType && method.returnType !== "void") {
          methodText += `: ${method.returnType}`;
        }
      } else {
        methodText += "()";
      }

      ctx.fillText(methodText, x + this.TEXT_MARGIN, textY);
      textY += style.lineHeight * style.fontSize;
    });
  }

  private static __drawComponentInterfaces(
    bounds: Bounds,
    interfaces: UMLComponentInterface[],
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ): void {
    const { ctx } = context;

    // Separate provided and required interfaces
    const providedInterfaces = interfaces.filter((i) => i.type === "provided");
    const requiredInterfaces = interfaces.filter((i) => i.type === "required");

    // Draw provided interfaces (lollipops) on the right
    let rightY = bounds.y + bounds.height / 4;
    providedInterfaces.forEach((iface, _index) => {
      this.drawProvidedInterface(
        bounds.x + bounds.width,
        rightY,
        iface.name,
        style,
        ctx,
      );
      rightY += this.INTERFACE_SPACING;
    });

    // Draw required interfaces (sockets) on the left
    let leftY = bounds.y + bounds.height / 4;
    requiredInterfaces.forEach((iface, _index) => {
      this.drawRequiredInterface(bounds.x, leftY, iface.name, style, ctx);
      leftY += this.INTERFACE_SPACING;
    });
  }

  private static drawProvidedInterface(
    x: number,
    y: number,
    name: string,
    style: UMLRenderingStyle,
    ctx: CanvasRenderingContext2D,
  ): void {
    // Draw lollipop (circle on a line)
    ctx.strokeStyle = style.interfaceColor;
    ctx.fillStyle = style.backgroundColor;
    ctx.lineWidth = style.borderWidth;

    // Line from component
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 20, y);
    ctx.stroke();

    // Circle (lollipop)
    ctx.beginPath();
    ctx.arc(x + 20, y, this.INTERFACE_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Interface name
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x + 32, y);
  }

  private static drawRequiredInterface(
    x: number,
    y: number,
    name: string,
    style: UMLRenderingStyle,
    ctx: CanvasRenderingContext2D,
  ): void {
    // Draw socket (semi-circle)
    ctx.strokeStyle = style.interfaceColor;
    ctx.lineWidth = style.borderWidth;

    // Line to component
    ctx.beginPath();
    ctx.moveTo(x - 20, y);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Semi-circle (socket)
    ctx.beginPath();
    ctx.arc(x - 20, y, this.INTERFACE_RADIUS, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // Interface name
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x - 32, y);
  }

  private static drawCompartmentSeparator(
    x: number,
    y: number,
    width: number,
    style: UMLRenderingStyle,
    ctx: CanvasRenderingContext2D,
  ): void {
    ctx.strokeStyle = style.compartmentLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
  }

  private static drawInterfaceBox(
    bounds: Bounds,
    isSelected: boolean,
    style: UMLRenderingStyle,
    ctx: CanvasRenderingContext2D,
    interfaceType: string,
  ): void {
    // Set styles for interface
    ctx.fillStyle = style.backgroundColor;
    ctx.strokeStyle = isSelected ? style.selectedColor : style.borderColor;
    ctx.lineWidth = isSelected ? style.borderWidth * 2 : style.borderWidth;

    // Draw rounded rectangle with interface styling
    this.drawRoundedRect(
      ctx,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      style.cornerRadius,
    );
    ctx.fill();
    ctx.stroke();

    // Add interface indicator (circle for provided, socket for required)
    if (interfaceType === "export") {
      // Draw circle on right edge for provided interface
      ctx.fillStyle = style.primaryColor;
      ctx.beginPath();
      ctx.arc(bounds.x + bounds.width - 8, bounds.y + 20, 6, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      // Draw socket on left edge for required interface
      ctx.strokeStyle = style.primaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bounds.x + 8, bounds.y + 20, 6, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
  }

  private static drawInterfaceHeader(
    x: number,
    y: number,
    width: number,
    height: number,
    interfaceName: string,
    interfaceType: string,
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ): void {
    const { ctx } = context;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let textY = y + height / 2;

    // Draw interface stereotype
    ctx.font = `${style.fontSize - 1}px ${style.fontFamily}`;
    ctx.fillStyle = style.secondaryTextColor;
    const stereotype =
      interfaceType === "export" ? "«interface»" : "«required»";
    ctx.fillText(stereotype, x + width / 2, textY - 8);

    // Draw interface name
    ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.textColor;
    ctx.fillText(interfaceName, x + width / 2, textY + 8);
  }

  private static drawInterfaceFunctions(
    x: number,
    y: number,
    width: number,
    _height: number,
    functions: any[],
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ): void {
    const { ctx } = context;
    ctx.font = `${style.fontSize - 1}px ${style.fontFamily}`;
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    let textY = y + 16;
    const lineHeight = 16;
    const maxWidth = width - 24;

    functions.forEach((func: any) => {
      // Format function signature with better readability
      const params = (func.params || []).map(
        (param: any) => `${param.name}: ${param.param_type}`,
      );
      const returnType =
        func.returns && func.returns.length > 0
          ? func.returns[0].param_type || "void"
          : "void";

      // Handle long parameter lists by wrapping
      const funcName = `+ ${func.name}`;
      const paramString = params.join(", ");
      const returnString = `: ${returnType}`;

      // If the full signature fits, draw it on one line
      const fullSignature = `${funcName}(${paramString})${returnString}`;
      if (ctx.measureText(fullSignature).width <= maxWidth) {
        ctx.fillText(fullSignature, x + this.TEXT_MARGIN, textY);
        textY += lineHeight;
      } else {
        // Multi-line rendering for long signatures
        ctx.fillText(`${funcName}(`, x + this.TEXT_MARGIN, textY);
        textY += lineHeight;

        // Indent parameters
        const indent = x + this.TEXT_MARGIN + 20;
        params.forEach((param: any, index: number) => {
          const paramText =
            index < params.length - 1 ? `  ${param},` : `  ${param}`;
          if (ctx.measureText(paramText).width <= maxWidth - 20) {
            ctx.fillText(paramText, indent, textY);
            textY += lineHeight;
          } else {
            // Truncate very long parameter names
            const truncated = this.truncateText(paramText, maxWidth - 20, ctx);
            ctx.fillText(truncated, indent, textY);
            textY += lineHeight;
          }
        });

        ctx.fillText(`)${returnString}`, x + this.TEXT_MARGIN, textY);
        textY += lineHeight;
      }

      // Add small spacing between functions
      textY += 4;
    });
  }

  private static truncateText(
    text: string,
    maxWidth: number,
    ctx: CanvasRenderingContext2D,
  ): string {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }

    let truncated = text;
    while (
      ctx.measureText(truncated + "...").width > maxWidth &&
      truncated.length > 0
    ) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + "...";
  }

  private static drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Utility method to estimate text width
  private static measureText(
    text: string,
    font: string,
    ctx: CanvasRenderingContext2D,
  ): number {
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  // Method to calculate optimal component size based on content
  static calculateOptimalSize(
    element: ModelElement,
    style: UMLRenderingStyle,
    context: UMLRenderingContext,
  ): { width: number; height: number } {
    const { ctx } = context;
    const componentName = this.getComponentName(element);
    const attributes = this.getAttributes(element);
    const methods = this.getMethods(element);

    // Calculate width based on longest text
    let maxWidth = this.MIN_WIDTH;

    // Check component name width
    const nameWidth = this.measureText(
      componentName,
      `bold ${style.headerFontSize}px ${style.fontFamily}`,
      ctx,
    );
    maxWidth = Math.max(maxWidth, nameWidth + style.padding * 2);

    // Check attributes width
    attributes.forEach((attr) => {
      const attrText = `${attr.name}: ${attr.type}`;
      const attrWidth = this.measureText(
        attrText,
        `${style.fontSize}px ${style.fontFamily}`,
        ctx,
      );
      maxWidth = Math.max(maxWidth, attrWidth + style.padding * 2);
    });

    // Check methods width
    methods.forEach((method) => {
      const methodText = `${method.name}(): ${method.returnType || "void"}`;
      const methodWidth = this.measureText(
        methodText,
        `${style.fontSize}px ${style.fontFamily}`,
        ctx,
      );
      maxWidth = Math.max(maxWidth, methodWidth + style.padding * 2);
    });

    // Calculate height based on content
    let totalHeight = style.compartmentPadding * 2; // Header padding
    totalHeight += style.headerFontSize * style.lineHeight; // Component name

    if (attributes.length > 0) {
      totalHeight += style.compartmentPadding * 2; // Attributes padding
      totalHeight += attributes.length * style.lineHeight * style.fontSize;
    }

    if (methods.length > 0) {
      totalHeight += style.compartmentPadding * 2; // Methods padding
      totalHeight += methods.length * style.lineHeight * style.fontSize;
    }

    totalHeight = Math.max(totalHeight, this.MIN_HEIGHT);

    return {
      width: Math.min(maxWidth, 400), // Cap at reasonable max width
      height: totalHeight,
    };
  }
}
