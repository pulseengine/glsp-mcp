/**
 * Animation and Transition Systems
 *
 * Complete animation framework for UI components and graphics elements
 *
 * @author GLSP-Rust Animation Team
 * @version 1.0.0
 */

// Core animation system
export {
  AnimationSystem,
  animationSystem,
  type AnimationConfig,
  type TransitionConfig,
} from "./AnimationSystem.js";

// Graphics-specific animations
export {
  GraphicsAnimationEngine,
  GraphicsAnimation,
  GroupAnimation,
  SpringAnimation,
  ParticleSystemAnimation,
  Easings,
  type GraphicsAnimationConfig,
  type AnimatedProperty,
  type ParticleBehavior,
} from "./GraphicsAnimations.js";

// UI component animations
export {
  AnimatedButton,
  PageTransitionManager,
  LoadingStateManager,
  MicroInteractions,
  initializeAnimatedComponents,
} from "./AnimatedComponents.js";

// Graphics integration
export {
  GraphicsAnimationIntegration,
  graphicsAnimationIntegration,
  type AnimatedGraphicsNode,
} from "./GraphicsAnimationIntegration.js";

// Usage Example:
/*
import {
    animationSystem,
    AnimatedButton,
    graphicsAnimationIntegration
} from '../animation/index.js';

// Initialize UI animations
const button = document.querySelector('#my-button') as HTMLButtonElement;
new AnimatedButton(button, {
    hoverAnimation: 'lift',
    clickAnimation: 'ripple'
});

// Create graphics animations
const node = {
    id: 'wave-1',
    type: 'sine-wave-visualizer',
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    properties: { amplitude: 50, frequency: 0.02 }
};

graphicsAnimationIntegration.registerAnimatedNode(node);

// System-wide animations
animationSystem.animate(element, {
    type: 'fade',
    duration: 300,
    easing: 'ease-out'
});
*/
