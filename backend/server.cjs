const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });
const path = require('path');

const app = express();
const PORT = process.env.PORT || 6002;

// Enhanced CORS configuration for Vercel
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
      'https://*.vercel.app'
    ].filter(Boolean);

    if (allowedOrigins.indexOf(origin) !== -1 ||
      allowedOrigins.some(allowed => origin.endsWith(allowed)) ||
      process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced Mongoose Connection Setup for serverless
const connectDB = async () => {
  // Check if we're already connected
  if (mongoose.connection.readyState === 1) {
    console.log('Using existing MongoDB connection');
    return mongoose.connection;
  }

  try {
    if (!process.env.ATLAS_URI) {
      throw new Error('ATLAS_URI environment variable is not defined');
    }

    const conn = await mongoose.connect(process.env.ATLAS_URI, {
      dbName: 'healthcare',
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 5, // Reduced for serverless
      minPoolSize: 1,
      family: 4, // Use IPv4
      retryWrites: true,
      w: 'majority'
    });

    console.log('MongoDB connected via Mongoose');
    return conn;
  } catch (err) {
    console.error('Mongoose connection error:', err);
    // In serverless, we don't exit the process
    throw err;
  }
};

// Global connection cache for serverless
let cachedConnection = null;

const connectToDatabase = async () => {
  if (cachedConnection) {
    return cachedConnection;
  }

  try {
    cachedConnection = await connectDB();
    return cachedConnection;
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check with DB status (important for Vercel)
app.get('/api/health', async (req, res) => {
  try {
    await connectToDatabase();
    const dbStatus = mongoose.connection.readyState;
    res.json({
      status: 'Healthcare Database API is running',
      dbStatus: dbStatus === 1 ? 'Connected' : 'Disconnected',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'Healthcare Database API is running',
      dbStatus: 'Connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Load routes with error handling
const loadRoute = (routePath, routeName) => {
  try {
    const route = require(routePath);
    app.use(`/api/${routeName}`, route);
    console.log(`✓ Loaded route: /api/${routeName}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to load route ${routeName}:`, error.message);
    // Create a placeholder route to avoid crashes
    app.use(`/api/${routeName}`, (req, res) => {
      res.status(501).json({
        error: `Route ${routeName} is not implemented`,
        message: 'This API endpoint is temporarily unavailable'
      });
    });
    return false;
  }
};

// Load all routes
loadRoute('./routes/about.cjs', 'about');
loadRoute('./routes/collections.cjs', 'collections');
loadRoute('./routes/services.cjs', 'services');
loadRoute('./routes/hospitals.cjs', 'hospitals');
loadRoute('./routes/procedureCosts.cjs', 'procedure-costs');
loadRoute('./routes/patientOpinion.cjs', 'patient-opinions');
loadRoute('./routes/faqs.cjs', 'faqs');
loadRoute('./routes/assistance.cjs', 'assistance');
loadRoute('./routes/doctor.cjs', 'doctors');
loadRoute('./routes/treatments.cjs', 'treatments');
loadRoute('./routes/doctorTreatments.cjs', 'doctor-treatment');
loadRoute('./routes/hospitalTreatments.cjs', 'hospital-treatment');
loadRoute('./routes/bookings.cjs', 'booking');
loadRoute('./routes/admin.cjs', 'admin');
loadRoute('./routes/language.cjs', 'language');
loadRoute('./routes/headings.cjs', 'headings');
loadRoute('./routes/blog.cjs', 'blogs');
loadRoute('./routes/upload.cjs', 'upload');
loadRoute('./routes/patient.cjs', 'patients');

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Healthcare API Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/api/health',
      docs: 'Available endpoints: /api/*'
    }
  });
});

// FIXED: 404 handler for API routes - use a parameter instead of *
app.use('/api/:unmatchedRoute', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    attemptedRoute: req.params.unmatchedRoute
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
});

// Vercel serverless function handler
const handler = async (req, res) => {
  // Connect to database on each request (Vercel serveless functions are stateless)
  try {
    await connectToDatabase();
  } catch (error) {
    console.error('Database connection failed in handler:', error);
    // Don't fail the request completely, but note the DB issue
    req.dbConnectionFailed = true;
  }

  // Pass the request to Express
  return app(req, res);
};

// For Vercel serverless functions
module.exports = handler;

// For local development, start the server normally
if (process.env.NODE_ENV !== 'production') {
  const startServer = async () => {
    try {
      await connectToDatabase();
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
      });
    } catch (err) {
      console.error('Server startup failed:', err);
      process.exit(1);
    }
  };

  // Graceful shutdown for local development
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    try {
      await mongoose.disconnect();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
    process.exit(0);
  });

  startServer();
}