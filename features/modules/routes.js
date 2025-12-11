import express from 'express';
import { ModuleController } from './controller.js';

const router = express.Router();

// Routes
router.get('/', ModuleController.getAll);
router.get('/:id', ModuleController.getById);
router.post('/', ModuleController.create);
router.put('/:id', ModuleController.update);
router.delete('/:id', ModuleController.delete);

export default router;

