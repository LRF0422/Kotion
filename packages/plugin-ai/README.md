# AI Plugin (@kn/plugin-ai)

AI-powered text and image generation plugin for the knowledge-repo editor.

## Features

### 🤖 AI Text Generation
- Generate text content using AI based on custom prompts
- Real-time streaming text generation with visual feedback
- Timestamp tracking for generated content
- Customizable prompts for different use cases

### 🎨 AI Image Generation
- Text-to-image generation using AI models
- Custom prompt input for image descriptions
- Image preview and management
- Error handling with user-friendly feedback

### ⚡ Quick AI Actions
Dropdown menu with quick AI text transformations:
- **Continue Writing** - Extend existing text
- **Simplify** - Simplify complex content
- **Add Emoji** - Insert relevant emojis
- **Change Tone** - Rewrite in different tones (Friendly, Formal, Casual, Written)
- **Translate** - Translate to multiple languages (Chinese, English, German, Japanese)

### 💬 AI Chat Interface
- Interactive chat interface for AI conversations
- Streaming responses with markdown support
- Message history management
- User avatar integration

## Installation

```bash
pnpm add @kn/plugin-ai
```

## Usage

### Basic Setup

```typescript
import { ai } from '@kn/plugin-ai';

// Register the plugin
editor.registerPlugin(ai);
```

### Configuration

The plugin accepts optional configuration:

```typescript
interface AiPluginConfig {
  // API endpoint for AI text generation
  apiEndpoint?: string;
  
  // API key for AI services
  apiKey?: string;
  
  // Image generation API endpoint
  imageApiEndpoint?: string;
}
```

### Environment Variables

For security, configure API credentials via environment variables:

```bash
# .env.local
VITE_AI_IMAGE_API_KEY=your_api_key_here
```

## Slash Commands

### `/ai` - Insert AI Text Block
Inserts an AI text generation block with:
- Prompt input field
- Generate button with loading state
- Generated content display
- Timestamp of generation

### `/aiImage` - Insert AI Image Block
Inserts an AI image generation block with:
- Prompt input for image description
- Generate button
- Image preview
- Delete option

## AI Tools Menu

When text is selected, the AI Tools menu provides quick actions:

1. **Continue Writing** - Extends the selected text
2. **Simplify** - Simplifies the selected content
3. **Add Emoji** - Adds relevant emojis to text
4. **Change Tone** - Rewrites in different tones
5. **Translate** - Translates to various languages

## Architecture

### Components

- **AiView** - Main component for AI text generation blocks
- **AiImageView** - Component for AI image generation blocks
- **AiStaticMenu** - Dropdown menu for quick AI actions
- **ExpandableChatDemo** - Chat interface component
- **TextLoadingDecorationExtension** - Provides streaming text feedback

### Utilities

- **aiText()** - Generate AI text from editor selection
- **aiGeneration()** - Generate AI text from prompt with streaming
- **aiImageWriter()** - Generate images from text prompts

## Optimization Features

### Performance
- ✅ React hooks optimization (useCallback, useMemo)
- ✅ Proper dependency management
- ✅ Memoized menu items to prevent re-renders
- ✅ Efficient state management

### Code Quality
- ✅ TypeScript types for all functions and components
- ✅ Comprehensive error handling
- ✅ Centralized logger utility (no console.log)
- ✅ Extracted constants and configuration
- ✅ Clean code with proper comments

### Internationalization
- ✅ Full i18n support (English + Chinese)
- ✅ Configurable translation keys
- ✅ Dynamic language switching

### Security
- ✅ Environment variable support for API keys
- ✅ Input validation
- ✅ Error boundary protection

## Development

### Build

```bash
pnpm build
```

### Watch Mode

```bash
pnpm dev
```

## Dependencies

- `@kn/common` - Common utilities and hooks
- `@kn/core` - Core editor functionality
- `@kn/editor` - Editor components and extensions
- `@kn/icon` - Icon components
- `@kn/ui` - UI component library

## API Integration

The plugin currently integrates with:
- AI text generation API (configurable endpoint)
- Image generation API (Zhipu AI CogView-3-Plus)

### Customizing API Integration

You can customize the API endpoints by:

1. Setting environment variables:
   ```bash
   VITE_AI_IMAGE_API_KEY=your_key
   ```

2. Modifying the plugin configuration:
   ```typescript
   const ai = new AiPlugin({
     apiEndpoint: 'https://your-api.com/generate',
     imageApiEndpoint: 'https://your-api.com/images',
     apiKey: 'your-key'
   });
   ```

## Best Practices

1. **Always validate prompts** before sending to API
2. **Handle errors gracefully** with user feedback
3. **Use streaming** for better user experience
4. **Log errors** for debugging (uses centralized logger)
5. **Clean up decorations** after generation completes
6. **Disable actions during loading** to prevent race conditions

## Future Improvements

- [ ] Configurable AI model selection
- [ ] Image editing capabilities
- [ ] More language support
- [ ] Custom AI action templates
- [ ] Batch operations
- [ ] AI suggestion system

## License

ISC

## Contributing

Contributions are welcome! Please ensure:
- Code follows the project's TypeScript standards
- All functions have proper type annotations
- Error handling is implemented
- i18n keys are added for new text
- No console.log statements (use logger utility)
