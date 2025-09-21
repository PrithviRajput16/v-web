const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

// Use environment variables directly (Vercel provides these)
const NODE_ENV = process.env.NODE_ENV || 'development';

// Only use dotenv in development
if (NODE_ENV === 'development') {
  try {
    console.log('hehe: dev');
    require('dotenv').config({ path: './config.env' });
    console.log('Development environment variables loaded from config.env');
  } catch (error) {
    console.warn('config.env not found, using process environment variables');
  }
}
const ATLAS_URI = process.env.ATLAS_URI;
const app = express();
const PORT = process.env.PORT || 6002;

// Enhanced CORS for Vercel (allow your frontend domain)
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://v-web-frontend-flame.vercel.app',
    'https://v-web-frontend-s8pe.vercel.app'
  ],
  credentials: true
}));

app.use(express.json());

// Enhanced Mongoose Connection Setup
const connectDB = async () => {
  try {
    if (!ATLAS_URI) {
      throw new Error('ATLAS_URI environment variable is not defined');
    }

    await mongoose.connect(ATLAS_URI, {
      dbName: 'healthcare',
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    });
    console.log('MongoDB connected via Mongoose');
  } catch (err) {
    console.error('Mongoose connection error:', err);
    // Don't exit process in serverless environment
    if (NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// Routes - Load with error handling (NO FALLBACK)
const loadRoute = (routePath, routeName) => {
  try {
    const route = require(routePath);
    app.use(`/api/${routeName}`, route);
    console.log(`✓ Loaded route: /api/${routeName}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to load route ${routeName}:`, error.message);
    // NO FALLBACK - just log the error
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

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check with DB status
app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  res.json({
    status: 'Healthcare Database API',
    dbStatus: dbStatus === 1 ? 'Connected' : 'Disconnected',
    environment: NODE_ENV
  });
});

// Additional health endpoint for Vercel
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  res.json({
    status: 'API is running',
    dbStatus: dbStatus === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
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
  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'production' ? 'Please try again later' : error.message
  });
});

// Vercel serverless function handler
const handler = async (req, res) => {
  // Connect to database if not already connected
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (error) {
      console.error('Database connection failed in handler:', error);
    }
  }

  // Pass the request to Express
  return app(req, res);
};

// For Vercel serverless functions
module.exports = handler;

// For local development, start the server normally
if (NODE_ENV !== 'production') {
  const startServer = async () => {
    try {
      console.log('NODE:', NODE_ENV);
      console.log('ATLAS_URI:', ATLAS_URI);

      await connectDB();

      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment: ${NODE_ENV}`);
      });
    } catch (err) {
      console.error('Server startup failed:', err);
      process.exit(1);
    }
  };

  // Graceful shutdown for local development
  process.on('SIGINT', async () => {
    await mongoose.disconnect();
    console.log('Mongoose connection closed');
    process.exit(0);
  });

  startServer();
}