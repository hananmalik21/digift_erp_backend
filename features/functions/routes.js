import express from 'express';
import { FunctionController } from './controller.js';

const router = express.Router();

// Routes
router.get('/', FunctionController.getAll);
router.get('/:id', FunctionController.getById);
router.get('/module/:moduleId', FunctionController.getByModuleId);
router.post('/', FunctionController.create);
router.put('/:id', FunctionController.update);
router.delete('/:id', FunctionController.delete);

export default router;

