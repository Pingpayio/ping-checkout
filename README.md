<div align="center">

![Banner](https://pingpay.gitbook.io/docs/~gitbook/image?url=https%3A%2F%2F2412975227-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F4y2jIy2xuLBz44dN9ue8%252Fuploads%252FdtjDAgTURmjEfNBefx2s%252FThe%2520Payment%2520Layer%2520for%2520the%2520Future%2520of%2520Commerce%2520%282%29.png%3Falt%3Dmedia%26token%3D1b23447b-795e-41ea-a11b-44dda7e36a5a&width=768&dpr=4&quality=100&sign=99531ead&sv=2)

[website](https://pingpay.io) | [docs](https://docs.pingpay.io) | [@pingpay_io](https://x.com/pingpay_io)

</div>



## Quick Start

```bash
bun install       # Install dependencies
bun db:migrate    # Run database migrations
bun dev           # Start all services (API, UI, Host)
```

Visit http://localhost:3001 to see the application.

## Documentation

- **[LLM.txt](./LLM.txt)** - Technical guide for LLMs and developers (architecture, patterns, examples)
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and development workflow
- **[API README](./api/README.md)** - API plugin documentation
- **[UI README](./ui/README.md)** - Frontend documentation
- **[Host README](./host/README.md)** - Server host documentation

## Development Workflow

1. **Make changes** to any workspace (ui/, api/, host/)
2. **Hot reload** works automatically during development
3. **Build & deploy** independently:
   - `bun build:ui` → uploads to CDN → updates `bos.config.json`
   - `bun build:api` → uploads to CDN → updates `bos.config.json`
   - Host automatically loads new versions!

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed development workflow.
