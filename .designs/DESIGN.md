---
name: Premium Tech Core
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#444651'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#555f6f'
  on-secondary: '#ffffff'
  secondary-container: '#d6e0f3'
  on-secondary-container: '#596373'
  tertiary: '#4b1c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#6e2c00'
  on-tertiary-container: '#f39461'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#d9e3f6'
  secondary-fixed-dim: '#bdc7d9'
  on-secondary-fixed: '#121c2a'
  on-secondary-fixed-variant: '#3d4756'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#ffb691'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#773205'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
  surface-white: '#FFFFFF'
  status-success: '#10B981'
  status-warning: '#F59E0B'
  status-error: '#EF4444'
  border-subtle: '#E5E7EB'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  data-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base-unit: 4px
  container-max: 1280px
  gutter-desktop: 24px
  margin-desktop: 40px
  gutter-mobile: 16px
  margin-mobile: 20px
---

## Brand & Style

The design system is engineered to project a "Technical Authority" through a modern, clean, and professional aesthetic. It targets a sophisticated audience that values precision and reliability. By blending **Minimalism** with **Corporate Modern** principles, the UI creates a high-trust environment essential for premium hardware e-commerce.

The visual narrative prioritizes the product above all else. A stark, pure white environment ensures that the vibrant displays and industrial design of mobile devices are the focal point. This is contrasted by a deep, authoritative blue that signals action and security. The interface feels "expensive" not through decorative flourishes, but through precise alignment, generous whitespace in consumer-facing areas, and purposeful information density in administrative contexts.

## Colors

This design system utilizes a high-contrast palette to establish clear hierarchies.

- **Primary (Deep Blue):** Reserved for high-value actions, brand identification, and active states. It represents the "engine" of the platform.
- **Secondary (Dark Gray):** Primarily used for typography and structural elements like sidebars or dividers. It provides the necessary weight to the interface.
- **Neutral/Surface:** The background remains `#FFFFFF` to maintain a gallery-like feel. `#F9FAFB` is utilized for secondary containers and table headers to provide subtle depth without breaking the minimal aesthetic.
- **Semantic Palette:** A standard set of Success, Warning, and Error colors is included specifically for order tracking states and form validation, following industry-standard accessibility patterns.

## Typography

The system uses **Inter** exclusively to leverage its exceptional legibility and neutral, technical character.

- **Scale:** The hierarchy is aggressive for prices and technical specs to ensure clarity in data-dense environments.
- **Tabular Data:** For admin tables and specification grids, a specialized 13px size is used to maximize information density without sacrificing readability.
- **Weight:** We use Semi-Bold (600) for section headings and Medium (500) for interactive labels to differentiate them clearly from standard body copy.

## Layout & Spacing

The layout philosophy follows a **Hybrid Density** model.

1.  **Consumer Experience:** Uses a 12-column fixed grid (centered) on desktop with 40px margins to create a "Premium" breathable feel. On mobile, it switches to a 4-column fluid grid.
2.  **Admin Experience:** Utilizes a fluid grid with a fixed 280px sidebar. This allows the data-dense tables and graphs to expand and utilize all available horizontal screen real estate.
3.  **Rhythm:** All spacing is derived from a 4px base unit. Component internal padding should favor 12px or 16px increments, while section vertical spacing should favor 64px or 80px to maintain clear separation.

## Elevation & Depth

Visual hierarchy is communicated through **Tonal Layers** and **Ambient Shadows**, inspired by the Material Design 3 elevation system but refined for a more minimalist tech aesthetic.

- **Level 0 (Base):** Pure white background for the main canvas.
- **Level 1 (Cards):** Subtly elevated with a very soft, diffused shadow (`0px 4px 20px rgba(0, 0, 0, 0.05)`). These cards house product items and dashboard widgets.
- **Level 2 (Active/Hover):** When a product card is hovered or an element is selected, the shadow deepens (`0px 8px 30px rgba(0, 0, 0, 0.08)`) to indicate interactivity.
- **Overlays:** Modals and dropdowns use a Level 3 elevation with a semi-transparent backdrop blur (12px) to maintain context while focusing user attention.

## Shapes

The shape language balances approachability with structural integrity.

- **Primary Radius:** A consistent 0.5rem (8px) is used for buttons and input fields to maintain a professional look.
- **Container Radius:** Product cards and dashboard containers use a larger 1rem (16px) radius to create a distinct, modern "object" feel.
- **Status Indicators:** Use a full pill-shape (999px) for badges and status chips to distinguish them from interactive buttons.

## Components

### Buttons & Inputs
- **Primary Button:** Deep Blue background, white text, 16px corner radius. High-contrast and impactful.
- **Input Fields:** 1px border (`#E5E7EB`) that transitions to Deep Blue on focus. Labels are always persistent above the field in `label-md`.

### Product Cards
- High-fidelity focus. The image occupies the top 60% of the card. Text is left-aligned. The price is styled in `headline-md` with Primary Blue to draw immediate attention.

### Admin Tables
- Borderless rows with a subtle `#F9FAFB` hover state. 
- Headers are in `label-md` with a Dark Gray color and 50% opacity.
- Data cells use the `data-tabular` type style for maximum scanability.

### Status Indicators (Order Tracking)
- **Timeline:** A vertical or horizontal track using 2px lines. Completed states use the Primary Blue or Success Green. Pending states use a dashed gray line.
- **Badges:** Small, pill-shaped containers with low-opacity background tints of the semantic colors (e.g., light green background with dark green text for "Delivered").

### Charts & Analytics
- Use the Primary Deep Blue as the main data color, with secondary accents in a lighter blue tint to maintain brand monochromatic harmony.