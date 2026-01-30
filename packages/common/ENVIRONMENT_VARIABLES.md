# Environment Variables in Plugins

This document explains how to properly configure and access environment variables in plugins for the Knowledge Repo application.

## Overview

The application uses Vite's environment variable system, where variables prefixed with `VITE_` are automatically exposed to client-side code. All environment variables are loaded from `.env` files located in the `apps/vite/` directory.

## Configuration Files

Environment variables are defined in these files in the `apps/vite/` directory:

- `.env.development` - Used during development
- `.env.production` - Used during production builds
- `.env.local` - Local overrides (not committed to git)

## How to Define Environment Variables

1. Add variables to the appropriate `.env` file in `apps/vite/`
2. Prefix all client-accessible variables with `VITE_`
3. Use descriptive names following the format `VITE_[PLUGIN]_[FEATURE]_[DESCRIPTION]`

Example:
```bash
# Plugin-specific configuration
VITE_MYPLUGIN_API_URL=https://api.example.com
VITE_MYPLUGIN_API_KEY=your_secret_key
VITE_MYPLUGIN_FEATURE_ENABLED=true

# General application configuration
VITE_API_BASE_URL=https://kotion.top:888/api
VITE_PLUGIN_UPLOAD_ENABLED=false
```

## How to Access Environment Variables in Plugins

### Method 1: Direct Access (Recommended)

Use the environment utilities provided in `@kn/common`:

```typescript
import { getEnvVariable, isEnvVarEnabled } from '@kn/common';

// Get a specific environment variable
const apiKey = getEnvVariable('MYPLUGIN_API_KEY', 'default-key');

// Check if a feature is enabled
const isFeatureEnabled = isEnvVarEnabled('MYPLUGIN_FEATURE_ENABLED');

// Use in your plugin code
const MyPluginComponent = () => {
  const apiUrl = getEnvVariable('MYPLUGIN_API_URL', 'https://default-api.com');
  
  useEffect(() => {
    if (isFeatureEnabled) {
      // Initialize feature
    }
  }, []);

  return <div>Plugin content</div>;
};
```

### Method 2: Direct Process Access

Access environment variables directly through the process object:

```typescript
// Access environment variables directly
const apiKey = process.env.VITE_MYPLUGIN_API_KEY;
const apiUrl = process.env.VITE_MYPLUGIN_API_URL || 'https://default-api.com';

// Check if running in development
const isDev = process.env.NODE_ENV === 'development';
```

## Available Environment Categories

### API Configuration
- `VITE_API_BASE_URL` - Base URL for API requests
- `VITE_API_TIMEOUT` - Request timeout in milliseconds

### Plugin Configuration
- `VITE_PLUGIN_UPLOAD_ENABLED` - Enable/disable plugin uploads
- `VITE_PLUGIN_UPLOAD_URL` - Endpoint for plugin uploads
- `VITE_PLUGIN_PUBLISH_URL` - Endpoint for plugin publishing

### AI Services
- `VITE_AI_IMAGE_API_KEY` - API key for AI image generation
- `VITE_BOCHA_API_KEY` - Bocha API key
- `VITE_DEEPSERACH_API_KEY` - Deep search API key

### Feature Flags
- `VITE_ENABLE_AUTO_DEPLOY` - Enable auto-deployment features

### WebSocket/Real-time
- `VITE_COLLABORATION_WS_URL` - WebSocket URL for collaboration

## Best Practices

### 1. Naming Convention
- Use uppercase letters and underscores
- Prefix with `VITE_` for client-accessible variables
- Use descriptive names that include plugin/service name
- Examples: `VITE_PLUGIN_NAME_API_KEY`, `VITE_SERVICE_FEATURE_ENABLED`

### 2. Security
- Never commit sensitive keys to the repository
- Use `.env.local` for local secrets that shouldn't be shared
- Provide safe defaults for sensitive values
- Use environment-specific values for development vs production

### 3. Fallback Values
- Always provide fallback values for optional variables
- Use reasonable defaults for boolean flags
- Validate required variables at runtime

### 4. Plugin Development
```typescript
// Good practice example
import { getEnvVariable, isEnvVarEnabled } from '@kn/common';

class MyPlugin extends KPlugin<MyPluginConfig> {
  constructor(config: MyPluginConfig) {
    // Get required environment variables with fallbacks
    const apiEndpoint = getEnvVariable('MYPLUGIN_API_ENDPOINT', 'https://api.default.com');
    const isEnabled = isEnvVarEnabled('MYPLUGIN_ENABLED') ?? true;
    
    // Use environment variables in plugin configuration
    super({
      ...config,
      services: {
        myService: {
          endpoint: apiEndpoint,
          enabled: isEnabled
        }
      }
    });
  }
}
```

## Adding New Environment Variables

1. Add the variable to `.env.example` with documentation
2. Add to both `.env.development` and `.env.production`
3. Update this documentation if the variable is significant
4. Provide clear examples and default values
5. Consider adding validation in your plugin code

## Troubleshooting

### Variables Not Available in Client Code
- Ensure the variable is prefixed with `VITE_`
- Restart the development server after changing `.env` files
- Verify the variable name matches exactly

### Different Values in Development vs Production
- Check that both `.env.development` and `.env.production` have the correct values
- Note that environment variables are compiled at build time, not runtime

### Accessing Variables in Build-Time Code
- Environment variables are resolved at build time
- They won't change after the application is built
- For runtime configuration, consider using API endpoints instead