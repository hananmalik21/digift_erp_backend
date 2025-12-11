import express from 'express';
import { FunctionPrivilegeController } from './controller.js';

const router = express.Router();

// Routes
router.get('/', FunctionPrivilegeController.getAll);
router.get('/:id', FunctionPrivilegeController.getById);
router.post('/', FunctionPrivilegeController.create);
router.put('/:id', FunctionPrivilegeController.update);
router.delete('/:id', FunctionPrivilegeController.delete);

export default router;

