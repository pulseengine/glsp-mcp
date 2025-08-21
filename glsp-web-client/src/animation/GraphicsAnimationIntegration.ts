/**
 * Graphics Animation Integration
 *
 * Connects the animation system to graphics components for seamless
 * animated visualizations within the diagram system
 */

import {
  GraphicsAnimationEngine,
  Easings,
  GraphicsAnimation,
  ParticleSystemAnimation,
} from "./GraphicsAnimations.js";
import {
  GRAPHICS_NODE_TYPES,
  GraphicsNodeType,
} from "../graphics/GraphicsNodeTypes.js";

export interface AnimatedGraphicsNode {
  id: string;
  type: string;
  bounds: { x: number; y: number; width: number; height: number };
  properties: Record<string, any>;
  animation?: {
    enabled: boolean;
    engine: GraphicsAnimationEngine;
    activeAnimations: Map<string, GraphicsAnimation>;
  };
}

export class GraphicsAnimationIntegration {
  private static instance: GraphicsAnimationIntegration;
  private animatedNodes: Map<string, AnimatedGraphicsNode> = new Map();
  private globalAnimationEngine: GraphicsAnimationEngine;
  private renderLoop: number | null = null;

  private constructor() {
    this.globalAnimationEngine = new GraphicsAnimationEngine();
    this.startRenderLoop();
  }

  public static getInstance(): GraphicsAnimationIntegration {
    if (!GraphicsAnimationIntegration.instance) {
      GraphicsAnimationIntegration.instance =
        new GraphicsAnimationIntegration();
    }
    return GraphicsAnimationIntegration.instance;
  }

  /**
   * Register a graphics node for animation
   */
  public registerAnimatedNode(node: AnimatedGraphicsNode): void {
    const nodeType = GRAPHICS_NODE_TYPES.find((type) => type.id === node.type);

    if (nodeType?.animation?.enabled) {
      // Create animation engine for this node
      const engine = new GraphicsAnimationEngine();

      node.animation = {
        enabled: true,
        engine: engine,
        activeAnimations: new Map(),
      };

      this.animatedNodes.set(node.id, node);

      // Setup node-specific animations
      this.setupNodeAnimations(node, nodeType);

      console.log(
        `🎬 Registered animated graphics node: ${node.type} (${node.id})`,
      );
    }
  }

  /**
   * Unregister an animated graphics node
   */
  public unregisterAnimatedNode(nodeId: string): void {
    const node = this.animatedNodes.get(nodeId);
    if (node?.animation) {
      // Stop all animations
      node.animation.engine.stopAll();
      node.animation.engine.destroy();
    }
    this.animatedNodes.delete(nodeId);
  }

  /**
   * Setup animations specific to node type
   */
  private setupNodeAnimations(
    node: AnimatedGraphicsNode,
    nodeType: GraphicsNodeType,
  ): void {
    if (!node.animation) return;

    const engine = node.animation.engine;

    switch (nodeType.id) {
      case "sine-wave-visualizer":
        this.setupSineWaveAnimation(node, engine);
        break;

      case "particle-system":
        this.setupParticleSystemAnimation(node, engine);
        break;

      case "radar-visualization":
        this.setupRadarAnimation(node, engine);
        break;

      case "waveform-display":
        this.setupWaveformAnimation(node, engine);
        break;

      case "status-led":
        this.setupStatusLEDAnimation(node, engine);
        break;
    }
  }

  /**
   * Setup sine wave animation
   */
  private setupSineWaveAnimation(
    node: AnimatedGraphicsNode,
    engine: GraphicsAnimationEngine,
  ): void {
    const props = node.properties;

    // Animate phase for continuous wave movement
    const phaseAnimation = engine.animateValue("phase", 0, Math.PI * 2, {
      duration: 2000 / (props.speed || 0.05),
      easing: Easings.linear,
      loop: true,
      onUpdate: (progress) => {
        node.properties.phase = progress * Math.PI * 2;
      },
    });

    node.animation!.activeAnimations.set("phase", phaseAnimation);
  }

  /**
   * Setup particle system animation
   */
  private setupParticleSystemAnimation(
    node: AnimatedGraphicsNode,
    engine: GraphicsAnimationEngine,
  ): void {
    const props = node.properties;

    // Create particle system
    const particleSystem = engine.particleSystem("particles", {
      particleCount: props.maxParticles || 100,
      emitRate: props.emitRate || 2,
      lifetime: 3.0,
      behavior: {
        initialVelocity: { x: 0, y: -50 },
        acceleration: { x: 0, y: 20 },
        fade: true,
        scale: true,
        rotate: false,
      },
    });

    node.animation!.activeAnimations.set("particles", particleSystem);

    // Store particle system for rendering
    node.properties.particleSystem = particleSystem;
  }

  /**
   * Setup radar sweep animation
   */
  private setupRadarAnimation(
    node: AnimatedGraphicsNode,
    engine: GraphicsAnimationEngine,
  ): void {
    // Animate radar sweep angle
    const sweepAnimation = engine.animateValue("sweepAngle", 0, Math.PI * 2, {
      duration: 3000,
      easing: Easings.linear,
      loop: true,
      onUpdate: (progress) => {
        node.properties.sweepAngle = progress * Math.PI * 2;
      },
    });

    node.animation!.activeAnimations.set("sweep", sweepAnimation);
  }

  /**
   * Setup waveform animation
   */
  private setupWaveformAnimation(
    node: AnimatedGraphicsNode,
    engine: GraphicsAnimationEngine,
  ): void {
    const _props = node.properties;

    // Use _props for animation configuration
    const animationSpeed = _props.animationSpeed || 1000;
    const waveformType = _props.waveformType || "sine";
    const amplitude = _props.amplitude || 1;

    // Animate data points with spring physics
    const dataAnimation = engine.springAnimation("dataOffset", 0, amplitude, {
      stiffness: _props.springStiffness || 100,
      damping: _props.springDamping || 8,
      mass: _props.springMass || 1,
      duration: animationSpeed,
      easing: (t: number) => t, // Linear easing for spring
      loop: true,
      onUpdate: (progress) => {
        // Update waveform data based on type and progress
        let animatedValue = progress;
        if (waveformType === "sine") {
          animatedValue = Math.sin(progress * Math.PI * 2) * amplitude;
        } else if (waveformType === "square") {
          animatedValue = (progress > 0.5 ? 1 : -1) * amplitude;
        }
        node.properties.dataOffset = animatedValue;
      },
    });

    node.animation!.activeAnimations.set("data", dataAnimation);
  }

  /**
   * Setup status LED pulsing animation
   */
  private setupStatusLEDAnimation(
    node: AnimatedGraphicsNode,
    engine: GraphicsAnimationEngine,
  ): void {
    const props = node.properties;

    if (props.status === "active") {
      // Pulse animation for active state
      const pulseAnimation = engine.animateValue("brightness", 0.5, 1.0, {
        duration: 1000,
        easing: Easings.easeInOutCubic,
        loop: true,
        onUpdate: (progress) => {
          const brightness = 0.5 + progress * 0.5;
          node.properties.brightness = brightness;
        },
      });

      node.animation!.activeAnimations.set("pulse", pulseAnimation);
    }
  }

  /**
   * Render animated graphics node
   */
  public renderAnimatedNode(
    ctx: CanvasRenderingContext2D,
    node: AnimatedGraphicsNode,
    scale: number = 1,
  ): void {
    if (!node.animation?.enabled) return;

    const bounds = node.bounds;
    const props = node.properties;

    ctx.save();
    ctx.translate(bounds.x, bounds.y);
    ctx.scale(scale, scale);

    switch (node.type) {
      case "sine-wave-visualizer":
        this.renderAnimatedSineWave(ctx, bounds, props);
        break;

      case "particle-system":
        this.renderAnimatedParticles(ctx, bounds, props);
        break;

      case "radar-visualization":
        this.renderAnimatedRadar(ctx, bounds, props);
        break;

      case "waveform-display":
        this.renderAnimatedWaveform(ctx, bounds, props);
        break;

      case "status-led":
        this.renderAnimatedStatusLED(ctx, bounds, props);
        break;
    }

    ctx.restore();
  }

  /**
   * Render animated sine wave
   */
  private renderAnimatedSineWave(
    ctx: CanvasRenderingContext2D,
    bounds: { width: number; height: number },
    props: any,
  ): void {
    const { width, height } = bounds;
    const {
      amplitude = 50,
      frequency = 0.02,
      color = "#4A9EFF",
      phase = 0,
    } = props;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x < width; x += 2) {
      const y =
        height / 2 + Math.sin(x * frequency + phase) * (amplitude * 0.4);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Render animated particles
   */
  private renderAnimatedParticles(
    ctx: CanvasRenderingContext2D,
    bounds: { width: number; height: number },
    props: any,
  ): void {
    const particleSystem = props.particleSystem as ParticleSystemAnimation;
    if (!particleSystem) return;

    // Render particles at center of bounds
    particleSystem.render(ctx, bounds.width / 2, bounds.height / 2);
  }

  /**
   * Render animated radar
   */
  private renderAnimatedRadar(
    ctx: CanvasRenderingContext2D,
    bounds: { width: number; height: number },
    props: any,
  ): void {
    const { width, height } = bounds;
    const { sweepAngle = 0, color = "#00FF00" } = props;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;

    // Draw radar circles
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;

    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius / 3) * i, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw sweep line
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    const sweepX = centerX + Math.cos(sweepAngle - Math.PI / 2) * radius;
    const sweepY = centerY + Math.sin(sweepAngle - Math.PI / 2) * radius;
    ctx.lineTo(sweepX, sweepY);
    ctx.stroke();

    // Draw sweep arc (fade effect)
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius,
    );
    gradient.addColorStop(0, color + "40");
    gradient.addColorStop(1, color + "00");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      radius,
      sweepAngle - Math.PI / 2,
      sweepAngle - Math.PI / 2 + Math.PI / 6,
    );
    ctx.lineTo(centerX, centerY);
    ctx.fill();
  }

  /**
   * Render animated waveform
   */
  private renderAnimatedWaveform(
    ctx: CanvasRenderingContext2D,
    bounds: { width: number; height: number },
    props: any,
  ): void {
    const { width, height } = bounds;
    const { dataOffset = 0, color = "#FF6B6B", waveformData = [] } = props;

    if (waveformData.length === 0) {
      // Generate sample data if none provided
      for (let i = 0; i < 50; i++) {
        waveformData.push(Math.random() * 0.8 + 0.1);
      }
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const stepX = width / waveformData.length;

    waveformData.forEach((value: number, index: number) => {
      const x = index * stepX;
      const animatedValue =
        value + Math.sin((index + dataOffset * 10) * 0.3) * 0.2;
      const y = height - animatedValue * height * 0.8 - height * 0.1;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  /**
   * Render animated status LED
   */
  private renderAnimatedStatusLED(
    ctx: CanvasRenderingContext2D,
    bounds: { width: number; height: number },
    props: any,
  ): void {
    const { width, height } = bounds;
    const { status = "inactive", brightness = 1, color = "#4CAF50" } = props;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 4;

    // LED base
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
    ctx.fill();

    // LED light with animated brightness
    if (status === "active") {
      const adjustedColor = this.adjustColorBrightness(color, brightness);
      ctx.fillStyle = adjustedColor;

      // Glow effect
      const glow = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        radius * 2,
      );
      glow.addColorStop(0, adjustedColor + "80");
      glow.addColorStop(1, adjustedColor + "00");

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // LED core
      ctx.fillStyle = adjustedColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Inactive LED
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Helper method to adjust color brightness
   */
  private adjustColorBrightness(color: string, brightness: number): string {
    // Simple brightness adjustment - can be enhanced
    const opacity = Math.round(brightness * 255)
      .toString(16)
      .padStart(2, "0");
    return color + opacity;
  }

  /**
   * Start the main render loop
   */
  private startRenderLoop(): void {
    // The render loop is handled by the canvas renderer
    // This integration provides the animated node data
    console.log("🎬 Graphics Animation Integration: Render loop ready");
  }

  /**
   * Get all animated nodes
   */
  public getAnimatedNodes(): Map<string, AnimatedGraphicsNode> {
    return this.animatedNodes;
  }

  /**
   * Pause all animations
   */
  public pauseAll(): void {
    this.animatedNodes.forEach((node) => {
      if (node.animation) {
        node.animation.engine.stopAll();
      }
    });
  }

  /**
   * Resume all animations
   */
  public resumeAll(): void {
    this.animatedNodes.forEach((node, _nodeId) => {
      const nodeType = GRAPHICS_NODE_TYPES.find(
        (type) => type.id === node.type,
      );
      if (nodeType && node.animation) {
        this.setupNodeAnimations(node, nodeType);
      }
    });
  }

  /**
   * Cleanup all resources
   */
  public destroy(): void {
    this.pauseAll();
    this.animatedNodes.clear();
    this.globalAnimationEngine.destroy();

    if (this.renderLoop) {
      cancelAnimationFrame(this.renderLoop);
    }
  }
}

// Export singleton instance
export const graphicsAnimationIntegration =
  GraphicsAnimationIntegration.getInstance();
