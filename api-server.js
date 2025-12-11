import express from 'express';
import cors from 'cors';
import { createPool, closePool } from './config/db.js';
import moduleRoutes from './features/modules/routes.js';
import functionRoutes from './features/functions/routes.js';
import operationRoutes from './features/operations/routes.js';
import functionPrivilegeRoutes from './features/function-privileges/routes.js';
import dutyRoleRoutes from './features/duty-roles/routes.js';
import jobRoleRoutes from './features/job-roles/routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database pool on startup
await createPool();
console.log('✅ Database pool initialized');

// ==========================================
// 📌 HEALTH CHECK ENDPOINT
// ==========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'API Server is running',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 📌 API ROUTES
// ==========================================
app.use('/api/modules', moduleRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/function-privileges', functionPrivilegeRoutes);
app.use('/api/duty-roles', dutyRoleRoutes);
app.use('/api/job-roles', jobRoleRoutes);

// ==========================================
// 📌 404 HANDLER
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      'GET    /health',
      'GET    /api/functions?page=1&limit=10',
      'GET    /api/functions/:id',
      'GET    /api/functions/module/:moduleId?page=1&limit=10',
      'POST   /api/functions',
      'PUT    /api/functions/:id',
      'DELETE /api/functions/:id',
      'GET    /api/modules?page=1&limit=10',
      'GET    /api/modules/:id',
      'POST   /api/modules',
      'PUT    /api/modules/:id',
      'DELETE /api/modules/:id',
      'GET    /api/operations?page=1&limit=10',
      'GET    /api/operations/:id',
      'POST   /api/operations',
      'PUT    /api/operations/:id',
      'DELETE /api/operations/:id',
      'GET    /api/function-privileges?page=1&limit=10',
      'GET    /api/function-privileges/:id',
      'POST   /api/function-privileges',
      'PUT    /api/function-privileges/:id',
      'DELETE /api/function-privileges/:id',
      'GET    /api/duty-roles?page=1&limit=10',
      'GET    /api/duty-roles/:id',
      'POST   /api/duty-roles',
      'PUT    /api/duty-roles/:id',
      'DELETE /api/duty-roles/:id',
      'GET    /api/job-roles?page=1&limit=10',
      'GET    /api/job-roles/:id',
      'POST   /api/job-roles',
      'PUT    /api/job-roles/:id',
      'DELETE /api/job-roles/:id'
    ]
  });
});

// ==========================================
// 📌 START SERVER
// ==========================================
const server = app.listen(PORT, () => {
  console.log('\n🚀 Oracle Database API Server Started!');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log('\n📚 Available API Endpoints:');
  console.log(`   GET    http://localhost:${PORT}/health`);
  console.log(`   GET    http://localhost:${PORT}/api/functions?page=1&limit=10`);
  console.log(`   GET    http://localhost:${PORT}/api/functions/:id`);
  console.log(`   GET    http://localhost:${PORT}/api/functions/module/:moduleId?page=1&limit=10`);
  console.log(`   POST   http://localhost:${PORT}/api/functions`);
  console.log(`   PUT    http://localhost:${PORT}/api/functions/:id`);
  console.log(`   DELETE http://localhost:${PORT}/api/functions/:id`);
  console.log(`   GET    http://localhost:${PORT}/api/modules?page=1&limit=10`);
  console.log(`   GET    http://localhost:${PORT}/api/modules/:id`);
  console.log(`   POST   http://localhost:${PORT}/api/modules`);
  console.log(`   PUT    http://localhost:${PORT}/api/modules/:id`);
  console.log(`   DELETE http://localhost:${PORT}/api/modules/:id`);
  console.log(`   GET    http://localhost:${PORT}/api/operations?page=1&limit=10`);
  console.log(`   GET    http://localhost:${PORT}/api/operations/:id`);
  console.log(`   POST   http://localhost:${PORT}/api/operations`);
  console.log(`   PUT    http://localhost:${PORT}/api/operations/:id`);
  console.log(`   DELETE http://localhost:${PORT}/api/operations/:id`);
  console.log(`   GET    http://localhost:${PORT}/api/function-privileges?page=1&limit=10`);
  console.log(`   GET    http://localhost:${PORT}/api/function-privileges/:id`);
  console.log(`   POST   http://localhost:${PORT}/api/function-privileges`);
  console.log(`   PUT    http://localhost:${PORT}/api/function-privileges/:id`);
  console.log(`   DELETE http://localhost:${PORT}/api/function-privileges/:id`);
    console.log(`   GET    http://localhost:${PORT}/api/duty-roles?page=1&limit=10`);
    console.log(`   GET    http://localhost:${PORT}/api/duty-roles/:id`);
    console.log(`   POST   http://localhost:${PORT}/api/duty-roles`);
    console.log(`   PUT    http://localhost:${PORT}/api/duty-roles/:id`);
    console.log(`   DELETE http://localhost:${PORT}/api/duty-roles/:id`);
    console.log(`   GET    http://localhost:${PORT}/api/job-roles?page=1&limit=10`);
    console.log(`   GET    http://localhost:${PORT}/api/job-roles/:id`);
    console.log(`   POST   http://localhost:${PORT}/api/job-roles`);
    console.log(`   PUT    http://localhost:${PORT}/api/job-roles/:id`);
    console.log(`   DELETE http://localhost:${PORT}/api/job-roles/:id`);
  console.log('\n✨ Ready to accept requests!\n');
});

// ==========================================
// 📌 GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  server.close(async () => {
    console.log('📡 HTTP server closed');
    await closePool();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });
});
