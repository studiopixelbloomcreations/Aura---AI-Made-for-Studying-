// Aura Live Animations - UI animations and transition effects
"use strict";

class AuraLiveAnimations {
  constructor() {
    this.animationFrame = null;
    this.isInitialized = false;
  }
  
  // Initialize animations
  initialize() {
    if (this.isInitialized) return;
    
    // Create style element for animations
    const style = document.createElement('style');
    style.textContent = `
      /* Pulse animation for listening state */
      @keyframes pulse-listen {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      
      /* Wave animation for speaking state */
      @keyframes wave-speak {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      /* Processing animation */
      @keyframes pulse-process {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      /* Float animation for UI elements */
      @keyframes float {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
        100% { transform: translateY(0px); }
      }
      
      /* Shine effect for glassmorphism */
      @keyframes shine {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `;
    document.head.appendChild(style);
    
    this.isInitialized = true;
  }
  
  // Apply listening pulse animation to element
  applyListeningPulse(element, intensity = 1) {
    if (!this.isInitialized) this.initialize();
    
    element.style.animation = `pulse-listen ${2 - intensity * 0.5}s ease-in-out infinite`;
    return () => {
      element.style.animation = '';
    };
  }
  
  // Apply speaking wave animation to element
  applySpeakingWave(element, intensity = 1) {
    if (!this.isInitialized) this.initialize();
    
    element.style.animation = `wave-speak ${1.5 - intensity * 0.3}s ease-in-out infinite`;
    return () => {
      element.style.animation = '';
    };
  }
  
  // Apply processing spin animation to element
  applyProcessingSpin(element) {
    if (!this.isInitialized) this.initialize();
    
    element.style.animation = 'pulse-process 1.5s linear infinite';
    return () => {
      element.style.animation = '';
    };
  }
  
  // Apply float animation to element
  applyFloat(element, duration = 3) {
    if (!this.isInitialized) this.initialize();
    
    element.style.animation = `float ${duration}s ease-in-out infinite`;
    return () => {
      element.style.animation = '';
    };
  }
  
  // Apply shine effect to glassmorphism elements
  applyShineEffect(element) {
    if (!this.isInitialized) this.initialize();
    
    element.style.backgroundImage = 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)';
    element.style.backgroundSize = '200% 100%';
    element.style.animation = 'shine 3s linear infinite';
    return () => {
      element.style.backgroundImage = '';
      element.style.backgroundSize = '';
      element.style.animation = '';
    };
  }
  
  // Create a transition between two states
  createStateTransition(fromElement, toElement, duration = 300) {
    if (!this.isInitialized) this.initialize();
    
    return new Promise((resolve) => {
      // Hide from element, show to element
      fromElement.style.opacity = '0';
      toElement.style.opacity = '1';
      fromElement.style.transition = `opacity ${duration}ms ease-in-out`;
      toElement.style.transition = `opacity ${duration}ms ease-in-out`;
      
      // Resolve after transition completes
      setTimeout(resolve, duration);
    });
  }
  
  // Create a fade-in animation
  createFadeIn(element, duration = 300) {
    if (!this.isInitialized) this.initialize();
    
    element.style.opacity = '0';
    element.style.transition = `opacity ${duration}ms ease-in-out`;
    
    // Trigger reflow to ensure transition works
    void element.offsetWidth;
    
    element.style.opacity = '1';
    
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
  
  // Create a fade-out animation
  createFadeOut(element, duration = 300) {
    if (!this.isInitialized) this.initialize();
    
    element.style.transition = `opacity ${duration}ms ease-in-out`;
    
    // Trigger reflow to ensure transition works
    void element.offsetWidth;
    
    element.style.opacity = '0';
    
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
  
  // Create a slide-in animation
  createSlideIn(element, direction = 'right', duration = 300) {
    if (!this.isInitialized) this.initialize();
    
    const transforms = {
      right: ['-100%', '0'],
      left: ['100%', '0'],
      top: ['0', '-100%'],
      bottom: ['0', '100%']
    };
    
    const [from, to] = transforms[direction] || transforms.right;
    
    element.style.transform = `translateX(${from})`;
    element.style.transition = `transform ${duration}ms ease-in-out`;
    
    // Trigger reflow to ensure transition works
    void element.offsetWidth;
    
    element.style.transform = `translateX(${to})`;
    
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
  
  // Create a slide-out animation
  createSlideOut(element, direction = 'right', duration = 300) {
    if (!this.isInitialized) this.initialize();
    
    const transforms = {
      right: ['0', '-100%'],
      left: ['0', '100%'],
      top: ['0', '100%'],
      bottom: ['0', '-100%']
    };
    
    const [from, to] = transforms[direction] || transforms.right;
    
    element.style.transform = `translateX(${from})`;
    element.style.transition = `transform ${duration}ms ease-in-out`;
    
    // Trigger reflow to ensure transition works
    void element.offsetWidth;
    
    element.style.transform = `translateX(${to})`;
    
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
  
  // Create a scale-in animation
  createScaleIn(element, duration = 300) {
    if (!this.isInitialized) this.initialize();
    
    element.style.transform = 'scale(0.95)';
    element.style.opacity = '0';
    element.style.transition = `transform ${duration}ms ease-in-out, opacity ${duration}ms ease-in-out`;
    
    // Trigger reflow to ensure transition works
    void element.offsetWidth;
    
    element.style.transform = 'scale(1)';
    element.style.opacity = '1';
    
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
  
  // Create a scale-out animation
  createScaleOut(element, duration = 300) {
    if (!this.isInitialized) this.initialize();
    
    element.style.transition = `transform ${duration}ms ease-in-out, opacity ${duration}ms ease-in-out`;
    
    // Trigger reflow to ensure transition works
    void element.offsetWidth;
    
    element.style.transform = 'scale(0.95)';
    element.style.opacity = '0';
    
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
  
  // Create a loading spinner
  createLoadingSpinner(element, size = 40, color = '#ffffff') {
    if (!this.isInitialized) this.initialize();
    
    element.innerHTML = `
      <div class="loading-spinner" style="
        width: ${size}px;
        height: ${size}px;
        border: ${size * 0.1}px solid ${color};
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin ${size * 0.01}s linear infinite;
      "></div>
    `;
    
    // Add keyframes for spin if not already present
    if (!document.querySelector('style[data-aura-spin]')) {
      const spinStyle = document.createElement('style');
      spinStyle.setAttribute('data-aura-spin', '');
      spinStyle.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(spinStyle);
    }
    
    return () => {
      element.innerHTML = '';
    };
  }
  
  // Shutdown animations
  shutdown() {
    // Cancel any active animation frame
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    this.isInitialized = false;
  }
}

// Export for use in browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = AuraLiveAnimations;
} else {
  window.AuraLiveAnimations = AuraLiveAnimations;
}