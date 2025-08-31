# ConcordiaSync Backend

Backend service for the ConcordiaSync Chrome extension, providing secure access to Concordia University's course data via their Open Data API.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment configuration:**
   ```bash
   cp .env.example .env
   # Edit .env with your Concordia API key
   ```

3. **Get Concordia API Key:**
   - Visit [Concordia Open Data](https://opendata.concordia.ca)
   - Request API access by emailing help@concordia.ca
   - Add your API key to `.env`

4. **Start the server:**
   ```bash
   npm run dev    # Development with nodemon
   npm start      # Production
   ```

## API Endpoints

### Health Check
```
GET /health
```

### Course Data
```
GET /api/courses/:term
GET /api/course/:code/:term
```

### Schedule Generation
```
POST /api/schedule/parse
POST /api/schedule/csv
```

## Security Features

- **Rate limiting** - 100 requests per hour per IP
- **CORS protection** - Only allows Chrome/Firefox extensions
- **Input validation** - All endpoints validate input data
- **Request timeout** - 30 second timeout for external API calls
- **Data sanitization** - All user input is sanitized

## Deployment

### Railway/Render/Vercel
1. Connect your Git repository
2. Set environment variables
3. Deploy automatically

### Manual Deployment
```bash
# Build and start
npm start
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `CONCORDIA_API_KEY` | Concordia Open Data API key | Yes |
| `CONCORDIA_API_BASE_URL` | API base URL | No |
| `NODE_ENV` | Environment (development/production) | No |
| `ALLOWED_ORIGINS` | CORS allowed origins | No |

## Development

### Testing
```bash
# Manual testing
curl http://localhost:3000/health
```

### Logging
- All API errors are logged to console
- Request validation errors include detailed messages
- Rate limiting includes retry-after headers

## Production Considerations

- Use a process manager like PM2
- Enable HTTPS (required for Chrome extensions)
- Set up proper logging (Winston/Pino)
- Configure monitoring (health checks, metrics)
- Use a proper database for caching (Redis)