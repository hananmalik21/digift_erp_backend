import express from 'express';
import { UserController } from './controller.js';

const router = express.Router();

// Routes
router.get('/', UserController.getAll);
router.post('/accounts', UserController.createAccount);
router.get('/:id', UserController.getById);
router.put('/:id', UserController.updateAccount);
router.put('/:id/reset-password', UserController.resetPassword);
router.delete('/:id', UserController.deleteAccount);

export default router;

