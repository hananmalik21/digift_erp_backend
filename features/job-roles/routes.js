import express from 'express';
import { JobRoleController } from './controller.js';

const router = express.Router();

// Routes
router.get('/', JobRoleController.getAll);
router.post('/', JobRoleController.create);

// Duty role management routes (must come before /:id routes)
router.post('/:id/duty-roles', JobRoleController.addDutyRoles);
router.delete('/:id/duty-roles/:dutyRoleId', JobRoleController.removeDutyRole);

// CRUD routes
router.get('/:id', JobRoleController.getById);
router.put('/:id', JobRoleController.update);
router.delete('/:id', JobRoleController.delete);

export default router;
