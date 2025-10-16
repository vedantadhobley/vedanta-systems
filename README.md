# Vite + React + shadcn/ui Frontend

A modern, Dockerized frontend application built with:
- **Vite** - Next generation frontend tooling
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Component library (ready to use)
- **Docker** - Containerization for AWS deployment

## Project Structure

```
.
├── src/                    # Source code
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # Main App component
│   └── index.css          # Global styles
├── public/                # Static assets
├── index.html             # HTML entry point
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies
├── Dockerfile             # Docker configuration
└── README.md              # This file
```

## Getting Started

### Prerequisites
- Node.js 16+ and npm/yarn
- Docker (for containerization)

### Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```
   The app will open at `http://localhost:3000`

3. **Run type checking:**
   ```bash
   npm run type-check
   ```

4. **Lint code:**
   ```bash
   npm run lint
   ```

### Building

1. **Build for production:**
   ```bash
   npm run build
   ```
   Output will be in the `dist/` directory

2. **Preview production build locally:**
   ```bash
   npm run preview
   ```

## Docker

### Building the Docker Image

```bash
docker build -t vedanta-systems-frontend:latest .
```

### Running Locally with Docker

```bash
docker run -p 3000:3000 vedanta-systems-frontend:latest
```

Visit `http://localhost:3000`

### Docker Image Details

- **Base Image:** `node:18-alpine` (lightweight, production-ready)
- **Multi-stage build:** Optimized for smaller final image size
- **Health check:** Built-in health check endpoint
- **Port:** 3000 (configurable via environment)

## AWS Deployment

### Prerequisites
- AWS account with ECR and ECS access
- AWS CLI configured

### Steps

1. **Create ECR repository:**
   ```bash
   aws ecr create-repository --repository-name vedanta-systems-frontend --region us-east-1
   ```

2. **Build and push to ECR:**
   ```bash
   # Get login token
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   
   # Build image
   docker build -t vedanta-systems-frontend:latest .
   
   # Tag for ECR
   docker tag vedanta-systems-frontend:latest <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest
   
   # Push to ECR
   docker push <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest
   ```

3. **Deploy to ECS or EC2:**
   - Use CloudFormation, Terraform, or AWS Console to deploy
   - Configure your domain (vedanta.systems) with Route 53
   - Set up CloudFront for CDN (optional but recommended)

## Environment Variables

Create a `.env` file in the project root for local development:

```env
VITE_API_BASE_URL=http://your-backend-service:8080
VITE_ENVIRONMENT=development
```

Environment variables must be prefixed with `VITE_` to be exposed to the client.

## Adding shadcn/ui Components

This project is set up for shadcn/ui. To add components:

The component library is configured and ready to use. Just import and customize!

## Customization

### Tailwind CSS
- Edit `tailwind.config.js` to customize colors, fonts, and themes
- The project includes CSS variables for a cohesive design system
- Light and dark mode support built-in

### TypeScript
- All files use TypeScript for type safety
- Configure paths in `tsconfig.json` (path aliases like `@/*` are set up)

## Build Output

The production build creates optimized files in `dist/`:
- Minified JavaScript
- Optimized CSS
- Source maps for debugging
- Ready for deployment to CDN or static host

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type checking |

## Next Steps

1. ✅ Project structure initialized
2. ⬜ Install dependencies: `npm install`
3. ⬜ Start development: `npm run dev`
4. ⬜ Build Docker image and test locally
5. ⬜ Set up AWS infrastructure
6. ⬜ Deploy to AWS

## Support

For questions about:
- **Vite:** https://vitejs.dev
- **React:** https://react.dev
- **Tailwind CSS:** https://tailwindcss.com
- **shadcn/ui:** https://ui.shadcn.com
- **TypeScript:** https://www.typescriptlang.org

Happy coding! 🚀