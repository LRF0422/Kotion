# KN Mobile App

Mobile web application for the Knowledge Repository, built with React, Vite, and TypeScript.

## 🚀 Quick Start

### Development

Start the development server on port 3001:

```bash
# From project root
pnpm mobile:dev

# Or from mobile directory
cd apps/mobile
pnpm dev
```

The app will be available at `http://localhost:3001`

For mobile device testing, the server is accessible at `http://0.0.0.0:3001`

### Build

Create a production build:

```bash
# From project root
pnpm mobile:build

# Or from mobile directory
cd apps/mobile
pnpm build
```

### Preview

Preview the production build:

```bash
pnpm mobile:preview
```

## 📱 Features

### Core Features
- **Mobile-First Design**: Optimized UI for mobile devices (320px - 1024px)
- **Touch Gestures**: Swipe, long-press, and tap interactions
- **Responsive Layout**: Adapts to different screen sizes and orientations
- **Safe Area Support**: Handles notched devices and system UI
- **PWA Ready**: Progressive Web App capabilities

### UI Components
- **Mobile Header**: Fixed top navigation with title and actions
- **Mobile Navigation**: Bottom tab bar navigation
- **Mobile Sidebar**: Slide-out drawer menu
- **Adapted Components**: Touch-optimized Button, Input, and Dialog components

### Pages
- **Home**: Dashboard with quick actions and recent items
- **Browser**: File and folder management with search
- **Settings**: App configuration and preferences

## 🏗️ Architecture

### Project Structure

```
src/
├── app/                    # Application entry
│   └── App.tsx            # Root component with routing
├── pages/                  # Page components
│   ├── Home/
│   ├── Browser/
│   └── Settings/
├── components/             # Reusable components
│   ├── layout/            # Layout components
│   │   ├── MobileHeader.tsx
│   │   ├── MobileNavigation.tsx
│   │   ├── MobileContent.tsx
│   │   ├── MobileFooter.tsx
│   │   └── MobileSidebar.tsx
│   ├── adapted/           # Mobile-adapted @kn/ui components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Dialog.tsx
│   └── common/            # Common components
├── hooks/                  # Custom React hooks
│   ├── useResponsive.ts   # Responsive breakpoint detection
│   ├── useViewport.ts     # Viewport size tracking
│   ├── useTouch.ts        # Touch gesture handling
│   └── useMediaQuery.ts   # Media query hooks
├── utils/                  # Utility functions
│   ├── responsive.ts      # Responsive helpers
│   └── touch.ts           # Touch utilities
└── styles/                 # Global styles
    ├── mobile.css         # Mobile-specific styles
    └── touch.css          # Touch interaction styles
```

### Technology Stack

| Technology | Purpose |
|------------|--------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool and dev server |
| React Router | Client-side routing |
| Tailwind CSS | Utility-first styling |
| @kn/ui | Shared component library |
| @kn/core | Business logic |
| Framer Motion | Animations |
| Lucide React | Icons |

## 🎨 Design System

### Breakpoints

- **xs**: 320px - 480px (Small phones)
- **sm**: 481px - 768px (Large phones, small tablets)
- **md**: 769px - 1024px (Tablets)
- **lg**: 1025px+ (Desktop fallback)

### Touch Targets

| Element | Minimum Size | Recommended |
|---------|--------------|-------------|
| Buttons | 44x44px | 48x48px |
| Input Fields | 44px height | 48px height |
| List Items | 44px height | 56px height |
| Icons | 24x24px | 32x32px |

### Typography Scale

| Element | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| H1 | 1.75rem | 2rem | 2.5rem |
| H2 | 1.5rem | 1.75rem | 2rem |
| H3 | 1.25rem | 1.5rem | 1.75rem |
| Body | 1rem | 1rem | 1rem |

## 🔧 Development

### Custom Hooks

#### useResponsive
```typescript
const { breakpoint, isMobile, isTablet, width, height } = useResponsive();
```

#### useTouch
```typescript
const { bind } = useTouch({
  onSwipeLeft: () => console.log('Swiped left'),
  onSwipeRight: () => console.log('Swiped right'),
  onLongPress: () => console.log('Long pressed'),
});

const ref = useRef(null);
useEffect(() => bind(ref.current), [bind]);
```

#### useMediaQuery
```typescript
const isMobile = useIsMobile();
const isLandscape = useIsLandscape();
const prefersDark = usePrefersDarkMode();
```

### Styling Utilities

#### Safe Area Classes
```tsx
<div className="safe-area-top safe-area-bottom">
  Content respects device safe areas
</div>
```

#### Touch Target Classes
```tsx
<button className="touch-target">Min 44x44px</button>
<button className="touch-target-lg">Min 48x48px</button>
```

#### Touch Active State
```tsx
<button className="touch-active">Scales on press</button>
```

## 📦 Dependencies

### Workspace Packages
- `@kn/core` - Core business logic and state management
- `@kn/ui` - Shared UI component library
- `@kn/editor` - Rich text editor (future integration)
- `@kn/common` - Common utilities and types

### Key Dependencies
- `react` & `react-dom` - UI framework
- `react-router-dom` - Routing
- `@use-gesture/react` - Touch gesture detection
- `framer-motion` - Animations
- `react-device-detect` - Device detection

## 🧪 Testing

### Device Testing

To test on physical devices:

1. Start dev server: `pnpm mobile:dev`
2. Find your local IP: `ifconfig` or `ipconfig`
3. Access from device: `http://YOUR_IP:3001`

### Recommended Test Devices

- **iOS**: iPhone 12/13/14 (Safari)
- **Android**: Samsung Galaxy S21/S22 (Chrome)
- **Tablet**: iPad Air (Safari)

### Test Scenarios

- [ ] Portrait and landscape orientations
- [ ] Touch interactions (tap, swipe, long press)
- [ ] Different screen sizes (320px to 1024px)
- [ ] Safe area handling on notched devices
- [ ] Keyboard appearance and hiding
- [ ] Navigation transitions

## 🚀 Deployment

### Build Output

The production build creates:
- Optimized JavaScript bundles (code-split by route)
- Extracted and minified CSS
- Static assets
- HTML entry point with mobile meta tags

### Performance Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3.5s |
| Bundle Size (gzipped) | < 200KB |

## 📚 Additional Resources

- [Design Document](/.qoder/quests/mobile-development.md)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React Router Documentation](https://reactrouter.com/)
- [Vite Documentation](https://vitejs.dev/)

## 🤝 Contributing

When contributing to the mobile app:

1. Follow mobile-first design principles
2. Ensure touch targets meet minimum size requirements
3. Test on actual mobile devices when possible
4. Consider performance implications
5. Maintain consistency with @kn/ui components

## 📄 License

MIT
