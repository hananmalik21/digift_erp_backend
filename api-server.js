import express from 'express';
import cors from 'cors';
import { createPool, closePool } from './config/db.js';
import { FunctionController } from './features/functions/controller.js';
import { ModuleController } from './features/modules/controller.js';

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
// 📌 FUNCTIONS ROUTES
// ==========================================
app.get('/api/functions', FunctionController.getAll);
app.get('/api/functions/:id', FunctionController.getById);
app.get('/api/functions/module/:moduleId', FunctionController.getByModuleId);
app.post('/api/functions', FunctionController.create);
app.put('/api/functions/:id', FunctionController.update);
app.delete('/api/functions/:id', FunctionController.delete);

// ==========================================
// 📌 MODULES ROUTES
// ==========================================
app.get('/api/modules', ModuleController.getAll);
app.get('/api/modules/:id', ModuleController.getById);
app.post('/api/modules', ModuleController.create);
app.put('/api/modules/:id', ModuleController.update);
app.delete('/api/modules/:id', ModuleController.delete);

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
      'DELETE /api/modules/:id'
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
