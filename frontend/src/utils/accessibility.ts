/**
 * Accessibility utilities for TruthLens
 * Implements WCAG 2.1 guidelines
 */

/**
 * Focus management utility
 * Helps manage keyboard navigation and focus restoration
 */
export const FocusManagement = {
  /**
   * Trap focus within an element (for modals)
   */
  trapFocus: (element: HTMLElement, onEscape?: () => void) => {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        onEscape();
      }
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => element.removeEventListener('keydown', handleKeyDown);
  },

  /**
   * Restore focus to an element after action completes
   */
  saveFocus: () => {
    const active = document.activeElement as HTMLElement;
    return () => active?.focus();
  }
};

/**
 * Keyboard navigation utilities
 */
export const KeyboardNavigation = {
  /**
   * Check if key is an arrow key
   */
  isArrowKey: (key: string): key is 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' => {
    return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key);
  },

  /**
   * Handle arrow key navigation for lists
   */
  handleListNavigation: (
    event: React.KeyboardEvent,
    items: HTMLElement[],
    currentIndex: number
  ): number | null => {
    const { key } = event;
    let newIndex = currentIndex;

    if (key === 'ArrowDown') {
      newIndex = Math.min(currentIndex + 1, items.length - 1);
    } else if (key === 'ArrowUp') {
      newIndex = Math.max(currentIndex - 1, 0);
    } else if (key === 'Home') {
      newIndex = 0;
    } else if (key === 'End') {
      newIndex = items.length - 1;
    } else {
      return null;
    }

    items[newIndex]?.focus();
    event.preventDefault();
    return newIndex;
  }
};

/**
 * Screen reader utilities
 * Provide feedback to users with assistive technologies
 */
export const ScreenReaderAnnouncements = {
  /**
   * Create an aria-live region for announcements
   */
  createLiveRegion: (politeness: 'polite' | 'assertive' = 'polite'): HTMLElement => {
    const region = document.createElement('div');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);
    return region;
  },

  /**
   * Announce a message to screen readers
   */
  announce: (message: string, politeness: 'polite' | 'assertive' = 'polite') => {
    const region = document.querySelector(`[aria-live="${politeness}"]`) ||
      ScreenReaderAnnouncements.createLiveRegion(politeness);
    region.textContent = message;
  },

  /**
   * Clear announcement
   */
  clear: () => {
    const regions = document.querySelectorAll('[aria-live]');
    regions.forEach(region => {
      region.textContent = '';
    });
  }
};

/**
 * Color contrast utilities
 * Ensure text meets WCAG AA standards
 */
export const ColorContrast = {
  /**
   * Calculate relative luminance (WCAG formula)
   */
  getLuminance: (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map(x => {
      x = x / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  },

  /**
   * Calculate contrast ratio between two colors
   */
  getContrastRatio: (rgb1: string, rgb2: string): number => {
    const parse = (rgb: string) => {
      const match = rgb.match(/\d+/g);
      return match ? match.map(Number) as [number, number, number] : [0, 0, 0];
    };

    const [r1, g1, b1] = parse(rgb1);
    const [r2, g2, b2] = parse(rgb2);

    const l1 = ColorContrast.getLuminance(r1, g1, b1);
    const l2 = ColorContrast.getLuminance(r2, g2, b2);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  },

  /**
   * Check if contrast meets WCAG AA standard (4.5:1 for text)
   */
  meetsWCAGAA: (rgb1: string, rgb2: string): boolean => {
    return ColorContrast.getContrastRatio(rgb1, rgb2) >= 4.5;
  }
};

/**
 * Form accessibility utilities
 */
export const FormAccessibility = {
  /**
   * Associate label with input
   */
  linkLabelToInput: (labelId: string, inputId: string) => {
    const label = document.getElementById(labelId);
    const input = document.getElementById(inputId);
    if (label && input) {
      label.htmlFor = inputId;
    }
  },

  /**
   * Show error with aria-describedby
   */
  showError: (inputId: string, errorMessage: string, errorId: string) => {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (input && error) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorId);
      error.textContent = errorMessage;
    }
  },

  /**
   * Clear error
   */
  clearError: (inputId: string, errorId: string) => {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (input && error) {
      input.setAttribute('aria-invalid', 'false');
      input.removeAttribute('aria-describedby');
      error.textContent = '';
    }
  }
};

/**
 * Skip link utility for keyboard users
 */
export const SkipLink = {
  /**
   * Create skip to main content link
   */
  createSkipLink: (): HTMLElement => {
    const link = document.createElement('a');
    link.href = '#main-content';
    link.className = 'sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2';
    link.textContent = 'Skip to main content';
    return link;
  }
};
