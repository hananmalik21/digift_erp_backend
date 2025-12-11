import express from 'express';
import { OperationController } from './controller.js';

const router = express.Router();

// Routes
router.get('/', OperationController.getAll);
router.get('/:id', OperationController.getById);
router.post('/', OperationController.create);
router.put('/:id', OperationController.update);
router.delete('/:id', OperationController.delete);

export default router;

