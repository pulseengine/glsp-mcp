/**
 * Graphics-specific animations for canvas components
 *
 * Provides smooth animations for:
 * - Graphics component state transitions
 * - Particle effects and physics simulations
 * - Waveform animations
 * - Chart transitions
 * - Camera and sensor visualizations
 */

// import { GraphicsBridge, GraphicsAPI } from '../wasm/graphics/GraphicsBridge.js';

export interface GraphicsAnimationConfig {
  duration: number;
  easing: (t: number) => number;
  loop?: boolean;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}

export interface AnimatedProperty {
  from: number;
  to: number;
  current: number;
}

export class GraphicsAnimationEngine {
  private animations: Map<string, GraphicsAnimation> = new Map();
  private animationFrame: number | null = null;
  private lastTime: number = 0;

  constructor() {
    this.startAnimationLoop();
  }

  /**
   * Animate a numeric property smoothly
   */
  public animateValue(
    id: string,
    from: number,
    to: number,
    config: GraphicsAnimationConfig,
  ): GraphicsAnimation {
    const animation = new GraphicsAnimation(
      id,
      { from, to, current: from },
      config,
    );
    this.animations.set(id, animation);
    return animation;
  }

  /**
   * Animate multiple properties simultaneously
   */
  public animateProperties(
    id: string,
    properties: Record<string, { from: number; to: number }>,
    config: GraphicsAnimationConfig,
  ): GroupAnimation {
    const animation = new GroupAnimation(id, properties, config);
    this.animations.set(id, animation);
    return animation;
  }

  /**
   * Create a spring physics animation
   */
  public springAnimation(
    id: string,
    from: number,
    to: number,
    config: {
      stiffness?: number;
      damping?: number;
      mass?: number;
    } & GraphicsAnimationConfig,
  ): SpringAnimation {
    const animation = new SpringAnimation(
      id,
      { from, to, current: from },
      config,
    );
    this.animations.set(id, animation);
    return animation;
  }

  /**
   * Create a particle system animation
   */
  public particleSystem(
    id: string,
    config: {
      particleCount: number;
      emitRate: number;
      lifetime: number;
      behavior: ParticleBehavior;
    },
  ): ParticleSystemAnimation {
    const animation = new ParticleSystemAnimation(id, config);
    this.animations.set(id, animation);
    return animation;
  }

  /**
   * Stop a specific animation
   */
  public stop(id: string): void {
    const animation = this.animations.get(id);
    if (animation) {
      animation.stop();
      this.animations.delete(id);
    }
  }

  /**
   * Stop all animations
   */
  public stopAll(): void {
    this.animations.forEach((animation) => animation.stop());
    this.animations.clear();
  }

  /**
   * Main animation loop
   */
  private startAnimationLoop(): void {
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - this.lastTime;
      this.lastTime = currentTime;

      // Update all active animations
      this.animations.forEach((animation, id) => {
        animation.update(deltaTime);

        if (animation.isComplete() && !animation.config.loop) {
          this.animations.delete(id);
        }
      });

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.stopAll();
  }
}

/**
 * Base animation class
 */
export class GraphicsAnimation {
  protected elapsed: number = 0;
  protected complete: boolean = false;

  constructor(
    public id: string,
    public property: AnimatedProperty,
    public config: GraphicsAnimationConfig,
  ) {}

  public update(deltaTime: number): void {
    if (this.complete && !this.config.loop) return;

    this.elapsed += deltaTime;
    let progress = Math.min(this.elapsed / this.config.duration, 1);

    if (this.config.loop && progress >= 1) {
      this.elapsed = 0;
      progress = 0;
    }

    // Apply easing
    const easedProgress = this.config.easing(progress);

    // Update property
    this.property.current =
      this.property.from +
      (this.property.to - this.property.from) * easedProgress;

    // Callbacks
    if (this.config.onUpdate) {
      this.config.onUpdate(progress);
    }

    if (progress >= 1) {
      this.complete = true;
      if (this.config.onComplete && !this.config.loop) {
        this.config.onComplete();
      }
    }
  }

  public getCurrentValue(): number {
    return this.property.current;
  }

  public isComplete(): boolean {
    return this.complete && !this.config.loop;
  }

  public stop(): void {
    this.complete = true;
  }
}

/**
 * Group animation for multiple properties
 */
export class GroupAnimation extends GraphicsAnimation {
  private properties: Map<string, AnimatedProperty> = new Map();

  constructor(
    id: string,
    propertyMap: Record<string, { from: number; to: number }>,
    config: GraphicsAnimationConfig,
  ) {
    super(id, { from: 0, to: 1, current: 0 }, config);

    Object.entries(propertyMap).forEach(([key, value]) => {
      this.properties.set(key, {
        from: value.from,
        to: value.to,
        current: value.from,
      });
    });
  }

  public update(deltaTime: number): void {
    super.update(deltaTime);

    const progress = this.property.current;

    this.properties.forEach((prop) => {
      prop.current = prop.from + (prop.to - prop.from) * progress;
    });
  }

  public getPropertyValue(key: string): number | undefined {
    return this.properties.get(key)?.current;
  }

  public getAllValues(): Record<string, number> {
    const values: Record<string, number> = {};
    this.properties.forEach((prop, key) => {
      values[key] = prop.current;
    });
    return values;
  }
}

/**
 * Spring physics animation
 */
export class SpringAnimation extends GraphicsAnimation {
  private velocity: number = 0;
  private stiffness: number;
  private damping: number;
  private mass: number;

  constructor(
    id: string,
    property: AnimatedProperty,
    config: {
      stiffness?: number;
      damping?: number;
      mass?: number;
    } & GraphicsAnimationConfig,
  ) {
    super(id, property, config);
    this.stiffness = config.stiffness || 180;
    this.damping = config.damping || 12;
    this.mass = config.mass || 1;
  }

  public update(deltaTime: number): void {
    const dt = deltaTime / 1000; // Convert to seconds

    // Spring force: F = -k * x
    const displacement = this.property.current - this.property.to;
    const springForce = -this.stiffness * displacement;

    // Damping force: F = -d * v
    const dampingForce = -this.damping * this.velocity;

    // Total force
    const force = springForce + dampingForce;

    // Acceleration: a = F / m
    const acceleration = force / this.mass;

    // Update velocity and position
    this.velocity += acceleration * dt;
    this.property.current += this.velocity * dt;

    // Check if animation is complete (settled)
    const threshold = 0.01;
    if (
      Math.abs(displacement) < threshold &&
      Math.abs(this.velocity) < threshold
    ) {
      this.property.current = this.property.to;
      this.complete = true;
    }

    // Callbacks
    if (this.config.onUpdate) {
      this.config.onUpdate(this.elapsed / this.config.duration);
    }
  }
}

/**
 * Particle behavior configuration
 */
export interface ParticleBehavior {
  initialVelocity: { x: number; y: number };
  acceleration: { x: number; y: number };
  fade: boolean;
  scale: boolean;
  rotate: boolean;
}

/**
 * Individual particle
 */
class Particle {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public life: number = 1;
  public scale: number = 1;
  public rotation: number = 0;
  public opacity: number = 1;

  constructor(x: number, y: number, behavior: ParticleBehavior) {
    this.x = x;
    this.y = y;
    this.vx = behavior.initialVelocity.x + (Math.random() - 0.5) * 2;
    this.vy = behavior.initialVelocity.y + (Math.random() - 0.5) * 2;
  }

  public update(deltaTime: number, behavior: ParticleBehavior): void {
    const dt = deltaTime / 1000;

    // Update position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Update velocity
    this.vx += behavior.acceleration.x * dt;
    this.vy += behavior.acceleration.y * dt;

    // Update life
    this.life -= dt;

    // Update visual properties
    if (behavior.fade) {
      this.opacity = Math.max(0, this.life);
    }

    if (behavior.scale) {
      this.scale = Math.max(0.1, this.life);
    }

    if (behavior.rotate) {
      this.rotation += dt * 2 * Math.PI;
    }
  }

  public isAlive(): boolean {
    return this.life > 0;
  }
}

/**
 * Particle system animation
 */
export class ParticleSystemAnimation extends GraphicsAnimation {
  private particles: Particle[] = [];
  private emitTimer: number = 0;
  private particleConfig: {
    particleCount: number;
    emitRate: number;
    lifetime: number;
    behavior: ParticleBehavior;
  };

  constructor(
    id: string,
    config: {
      particleCount: number;
      emitRate: number;
      lifetime: number;
      behavior: ParticleBehavior;
    },
  ) {
    super(
      id,
      { from: 0, to: 1, current: 0 },
      {
        duration: Infinity,
        easing: (t) => t,
        loop: true,
      },
    );
    this.particleConfig = config;
  }

  public update(deltaTime: number): void {
    // Emit new particles
    this.emitTimer += deltaTime;
    const emitInterval = 1000 / this.particleConfig.emitRate;

    while (
      this.emitTimer >= emitInterval &&
      this.particles.length < this.particleConfig.particleCount
    ) {
      this.emitTimer -= emitInterval;
      this.emitParticle();
    }

    // Update existing particles
    this.particles = this.particles.filter((particle) => {
      particle.update(deltaTime, this.particleConfig.behavior);
      return particle.isAlive();
    });
  }

  private emitParticle(): void {
    // Emit from center by default, can be customized
    const particle = new Particle(0, 0, this.particleConfig.behavior);
    this.particles.push(particle);
  }

  public getParticles(): Particle[] {
    return this.particles;
  }

  public render(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);

    this.particles.forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = particle.opacity;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.scale(particle.scale, particle.scale);

      // Draw particle (simple circle, can be customized)
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#4A9EFF";
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();
  }
}

/**
 * Common easing functions
 */
export const Easings = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - --t * t * t * t,
  easeInOutQuart: (t: number) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  elasticOut: (t: number) => {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    return (
      Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1
    );
  },
  bounceOut: (t: number) => {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    } else {
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    }
  },
};
