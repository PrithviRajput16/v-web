const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });
const path = require('path')

// Import routes
const aboutRouter = require('./routes/about.cjs');
const collectionsRouter = require('./routes/collections.cjs');
const serviceRouter = require('./routes/services.cjs');
const hospitalRouter = require('./routes/hospitals.cjs')
const procedureCostsRouter = require('./routes/procedureCosts.cjs');
const patientOpinionsRouter = require('./routes/patientOpinion.cjs');
const faqsRouter = require('./routes/faqs.cjs');
const assistanceRouter = require('./routes/assistance.cjs');
const doctorRouter = require('./routes/doctor.cjs');
const treatmentRoutes = require('./routes/treatments.cjs');
const doctorTreatmentRouter = require('./routes/doctorTreatments.cjs');
const hospitalTreatmentRouter = require('./routes/hospitalTreatments.cjs');
const bookingsRouter = require('./routes/bookings.cjs');
const adminRoutes = require('./routes/admin.cjs');
const languageRouter = require('./routes/language.cjs');
const headingRouter = require('./routes/headings.cjs')
const blogRouter = require('./routes/blog.cjs')
const uploadRoutes = require('./routes/upload.cjs');
const patientRoutes = require('./routes/patient.cjs');

const app = express();

// Enhanced CORS configuration for production
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'https://your-frontend-domain.vercel.app', // Replace with your actual frontend domain
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/collections', collectionsRouter);
app.use('/api/services', serviceRouter);
app.use('/api/hospitals', hospitalRouter);
app.use('/api/procedure-costs', procedureCostsRouter);
app.use('/api/patient-opinions', patientOpinionsRouter);
app.use('/api/faqs', faqsRouter);
app.use('/api/assistance', assistanceRouter);
app.use('/api/doctors', doctorRouter);
app.use('/api/treatments', treatmentRoutes);
app.use('/api/doctor-treatment', doctorTreatmentRouter);
app.use('/api/hospital-treatment', hospitalTreatmentRouter);
app.use('/api/booking', bookingsRouter);
app.use('/api/language', languageRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/about', aboutRouter);
app.use('/api/headings', headingRouter);
app.use('/api/blogs', blogRouter);
app.use('/api/upload', uploadRoutes);
app.use('/api/patients', patientRoutes);

// Health check with DB status
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  res.json({
    status: 'Healthcare Database API is running',
    dbStatus: dbStatus === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// Enhanced Mongoose Connection Setup with retry logic
const connectDB = async () => {
  try {
    if (!process.env.ATLAS_URI) {
      throw new Error('ATLAS_URI environment variable is not defined');
    }

    await mongoose.connect(process.env.ATLAS_URI, {
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
    // In serverless environment, we don't want to exit process
    // Let the connection retry on next request
  }
};

// Connect to database
connectDB();

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.status || 500).json({
    error: {
      message: error.message || 'Internal Server Error'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// For Vercel serverless functions, we need to export the app
module.exports = app;

// For local development, start the server normally
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 6002;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}