# Deriv AI Trading Platform

Production-ready AI-powered multi-market trading platform for Deriv API.

## Features

- **15 Contract Types**: Rise/Fall, Higher/Lower, Over/Under, Matches/Differs, Even/Odd, Digit contracts, Multipliers, Accumulators, Vanilla Options, Synthetic Indices, Boom/Crash, Step/Derived Indices
- **AI Analysis Engine**: Modular analyzers for each contract type with probability scoring
- **Real-time Trading**: WebSocket connection to Deriv API with auto-reconnect
- **Risk Management**: Configurable SL/TP, trade limits, daily loss caps
- **Admin Panel**: User management, platform stats, AI performance tracking
- **Secure**: JWT auth, bcrypt hashing, encrypted API tokens, rate limiting

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 5.0+
- Deriv account & API token

### 1. Install Backend
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp ../.env.example .env
# Edit .env with your values:
# - MONGODB_URI
# - JWT_SECRET (generate strong random string)
# - ENCRYPTION_KEY (32+ chars)
# - DERIV_APP_ID (from Deriv app settings)
# - DERIV_API_TOKEN (from Deriv account settings)
```

### 3. Start MongoDB
```bash
mongod --dbpath /path/to/data
```

### 4. Start Server
```bash
npm start        # Production
npm run dev      # Development with nodemon
```

### 5. Open Frontend
Open `frontend/index.html` in browser or serve via static server:
```bash
cd frontend
npx serve -s . -p 3000
```

## Project Structure

```
deriv-ai-trading-platform/
├── backend/
│   ├── ai/                    # AI analyzers
│   │   ├── baseAnalyzer.js    # Base class with technical indicators
│   │   ├── forexAnalyzer.js   # Forex: BOS, MA, RSI, session filter
│   │   ├── digitAnalyzer.js   # Digits: patterns, clustering, bias
│   │   ├── overUnderAnalyzer.js
│   │   ├── multiplierAnalyzer.js
│   │   ├── accumulatorAnalyzer.js
│   │   ├── syntheticAnalyzer.js
│   │   └── vanillaAnalyzer.js
│   ├── config/
│   │   ├── crypto.js          # AES-GCM encryption
│   │   └── derivContracts.js  # Contract type definitions
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   ├── admin.js           # Admin role check
│   │   └── errorHandler.js    # Centralized error handling
│   ├── models/
│   │   ├── User.js
│   │   ├── Trade.js
│   │   ├── AILog.js
│   │   └── Session.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── trades.js
│   │   ├── users.js
│   │   └── admin.js
│   ├── services/
│   │   └── derivService.js    # WebSocket client
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
└── README.md
```

## AI Analyzers

| Analyzer | Signals | Key Indicators |
|----------|---------|----------------|
| Forex | BUY/SELL/SKIP | BOS, SMA(20/50), RSI, BB, ATR, session filter |
| Digit | BUY/SKIP | Repeating patterns, clustering, statistical bias, streaks |
| Over/Under | BUY/SKIP | Distribution imbalance, threshold frequency |
| Multiplier | BUY/SKIP | Trend alignment, momentum strength, sideways detection |
| Accumulator | BUY/SKIP | Consistency score, growth rate, positive bias |
| Synthetic | BUY/SELL/SKIP | Spike probability, accumulation zones, tick momentum |
| Vanilla | CALL/PUT/SKIP | SMA alignment, support/resistance, IV estimate |

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/deriv-token` - Save encrypted Deriv token
- `POST /api/auth/logout` - Logout

### Trades
- `POST /api/trades/analyze` - Get AI analysis
- `POST /api/trades/execute` - Execute trade (AI approval gate)
- `GET /api/trades` - List trades
- `GET /api/trades/stats/summary` - Performance stats
- `POST /api/trades/:id/sell` - Early sell

### Users
- `PUT /api/users/risk-settings` - Update risk settings
- `GET /api/users/dashboard` - Dashboard data

### Admin
- `GET /api/admin/users` - List users
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/ai-performance` - AI accuracy metrics

## Security

- Passwords hashed with bcrypt (12 rounds)
- Deriv tokens encrypted with AES-GCM
- JWT tokens with expiration
- Rate limiting on all endpoints
- Trade frequency limits
- Input validation with express-validator
- Helmet security headers
- CORS configured for production

## License

MIT
