import { GraphicsAPI } from "./GraphicsBridge.js";

export interface GraphicsComponentConfig {
  width: number;
  height: number;
  backgroundColor?: string;
  antialiasing?: boolean;
  pixelRatio?: number;
}

export interface AnimationFrame {
  time: number;
  deltaTime: number;
  frameCount: number;
}

export interface GraphicsComponent {
  // Lifecycle methods
  initialize(
    graphics: GraphicsAPI,
    config?: GraphicsComponentConfig,
  ): Promise<void>;
  render(graphics?: GraphicsAPI, frame?: AnimationFrame): void;
  resize(width: number, height: number): void;
  destroy(): void;

  // Optional methods
  onMouseMove?(x: number, y: number): boolean;
  onMouseDown?(x: number, y: number, button?: number): boolean;
  onMouseUp?(x: number, y: number, button?: number): boolean;
  onKeyDown?(key: string, code: string): void;
  onKeyUp?(key: string, code: string): void;

  // Planned integration methods - ready for implementation
  supportsAnimation?: boolean;
  onFrame?(timestamp: number, deltaTime: number): Promise<void>;
  onClick?(x: number, y: number): boolean;
  updateProperties?(properties: Record<string, any>): Promise<void>;
}

export abstract class BaseGraphicsComponent implements GraphicsComponent {
  protected graphics!: GraphicsAPI;
  protected config!: GraphicsComponentConfig;
  protected isInitialized: boolean = false;

  async initialize(
    graphics: GraphicsAPI,
    config?: GraphicsComponentConfig,
  ): Promise<void> {
    this.graphics = graphics;
    this.config = config || { width: 200, height: 150 };

    // Clear canvas with background color
    if (this.config.backgroundColor) {
      graphics.clear();
      graphics.drawRect(0, 0, this.config.width, this.config.height, {
        fillColor: this.config.backgroundColor,
      });
    }

    await this.onInitialize();
    this.isInitialized = true;
  }

  abstract render(graphics?: GraphicsAPI, frame?: AnimationFrame): void;

  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.onResize(width, height);
  }

  destroy(): void {
    this.onDestroy();
    this.isInitialized = false;
  }

  // Override these in subclasses
  protected async onInitialize(): Promise<void> {}
  protected onResize(_width: number, _height: number): void {}
  protected onDestroy(): void {}
}

// Example: Animated sine wave component
export class SineWaveComponent extends BaseGraphicsComponent {
  private amplitude: number = 50;
  private frequency: number = 0.02;
  private speed: number = 0.05;
  private points: number = 100;

  render(graphics?: GraphicsAPI, frame?: AnimationFrame): void {
    if (!graphics || !frame) return;
    const { width, height } = this.config;

    // Clear canvas
    graphics.clear();

    // Draw background
    graphics.drawRect(0, 0, width, height, {
      fillColor: "#0A0E1A",
    });

    // Calculate wave points
    const wavePoints: Array<{ x: number; y: number }> = [];
    const centerY = height / 2;

    for (let i = 0; i <= this.points; i++) {
      const x = (i / this.points) * width;
      const y =
        centerY +
        Math.sin(x * this.frequency + frame.time * this.speed) * this.amplitude;
      wavePoints.push({ x, y });
    }

    // Draw wave using lines
    for (let i = 0; i < wavePoints.length - 1; i++) {
      graphics.drawLine(
        wavePoints[i].x,
        wavePoints[i].y,
        wavePoints[i + 1].x,
        wavePoints[i + 1].y,
        {
          strokeColor: "#4A9EFF",
          lineWidth: 3,
        },
      );
    }

    // Draw points
    wavePoints.forEach((point, index) => {
      if (index % 10 === 0) {
        graphics.drawCircle(point.x, point.y, 4, {
          fillColor: "#00D4AA",
        });
      }
    });

    // Draw info text
    graphics.drawText(`Frame: ${frame.frameCount}`, 10, 20, {
      fillColor: "#E5E9F0",
      font: "14px monospace",
    });
  }

  onMouseMove(_x: number, y: number): void {
    // Adjust amplitude based on mouse Y position
    this.amplitude = Math.max(10, Math.min(100, y - this.config.height / 2));
  }
}

// Example: Particle system component
export class ParticleSystemComponent extends BaseGraphicsComponent {
  private particles: Particle[] = [];
  private maxParticles: number = 100;
  private emitRate: number = 2;
  private lastEmitTime: number = 0;

  protected async onInitialize(): Promise<void> {
    // Initialize particle system
    this.particles = [];
  }

  render(graphics?: GraphicsAPI, frame?: AnimationFrame): void {
    if (!graphics || !frame) return;
    const { width, height } = this.config;

    // Clear with fade effect
    graphics.drawRect(0, 0, width, height, {
      fillColor: "rgba(10, 14, 26, 0.1)",
    });

    // Emit new particles
    if (frame.time - this.lastEmitTime > 1000 / this.emitRate) {
      this.emitParticle(width / 2, height / 2);
      this.lastEmitTime = frame.time;
    }

    // Update and draw particles
    this.particles = this.particles.filter((particle) => {
      // Update particle
      particle.x += (particle.vx * frame.deltaTime) / 16;
      particle.y += (particle.vy * frame.deltaTime) / 16;
      particle.life -= frame.deltaTime / 1000;

      if (particle.life <= 0) return false;

      // Draw particle
      const alpha = particle.life;
      const size = particle.size * (1 + (1 - particle.life) * 0.5);

      graphics.drawCircle(particle.x, particle.y, size, {
        fillColor: particle.color,
        alpha: alpha,
      });

      return true;
    });

    // Draw particle count
    graphics.drawText(`Particles: ${this.particles.length}`, 10, 20, {
      fillColor: "#E5E9F0",
      font: "14px monospace",
    });
  }

  private emitParticle(x: number, y: number): void {
    if (this.particles.length >= this.maxParticles) return;

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2 + 1;
    const colors = ["#4A9EFF", "#00D4AA", "#654FF0", "#F0B72F"];

    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    });
  }

  onMouseDown(x: number, y: number): void {
    // Emit burst of particles at mouse position
    for (let i = 0; i < 10; i++) {
      this.emitParticle(x, y);
    }
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

// Graphics component factory
export class GraphicsComponentFactory {
  private static components = new Map<string, new () => GraphicsComponent>();
  private components = new Map<string, GraphicsComponent>();

  static register(
    name: string,
    componentClass: new () => GraphicsComponent,
  ): void {
    this.components.set(name, componentClass);
  }

  static create(name: string): GraphicsComponent | null {
    const ComponentClass = this.components.get(name);
    return ComponentClass ? new ComponentClass() : null;
  }

  static getAvailable(): string[] {
    return Array.from(this.components.keys());
  }

  // Instance methods for dynamic component management
  registerComponent(info: {
    name: string;
    component: GraphicsComponent;
  }): void {
    this.components.set(info.name, info.component);
    console.log(
      `GraphicsComponentFactory: Registered component '${info.name}'`,
    );
  }

  createComponent(type: string, config?: any): GraphicsComponent | null {
    const component =
      this.components.get(type) || GraphicsComponentFactory.create(type);
    if (component && config) {
      // Apply configuration if component supports it
      if (
        "updateProperties" in component &&
        typeof component.updateProperties === "function"
      ) {
        (component as any).updateProperties(config);
      }
    }
    return component;
  }

  getAvailableComponents(): Array<{
    name: string;
    component: GraphicsComponent;
  }> {
    const result: Array<{ name: string; component: GraphicsComponent }> = [];
    this.components.forEach((component, name) => {
      result.push({ name, component });
    });
    return result;
  }
}

// Register example components
GraphicsComponentFactory.register("sine-wave", SineWaveComponent as any);
GraphicsComponentFactory.register("particles", ParticleSystemComponent as any);
