const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const DerivService = require('./services/derivService');
const errorHandler = require('./middleware/errorHandler');
const passport = require('./config/passport');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss://ws.binaryws.com", "https://ws.binaryws.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || 100),
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter limit for trades
const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.MAX_TRADES_PER_MINUTE || 5),
  message: { error: 'Trade rate limit exceeded' }
});
app.use('/api/trades/execute', tradeLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.static('../frontend'));

// MongoDB connection with retry logic
const connectDB = async (retries = 5) => {
  while (retries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.error(`MongoDB connection failed, retries left: ${retries}`, err.message);
      retries--;
      if (!retries) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    wsConnected: DerivService.isConnected()
  });
});

// Error handler
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await mongoose.connection.close();
  DerivService.disconnect();
  process.exit(0);
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    DerivService.connect();
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
