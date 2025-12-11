import express from 'express';
import { DutyRoleController } from './controller.js';

const router = express.Router();

// Routes
router.get('/', DutyRoleController.getAll);
router.post('/', DutyRoleController.create);

// Privilege management routes (must come before /:id routes)
router.post('/:id/privileges', DutyRoleController.addPrivileges);
router.delete('/:id/privileges/:privilegeId', DutyRoleController.removePrivilege);

// CRUD routes
router.get('/:id', DutyRoleController.getById);
router.put('/:id', DutyRoleController.update);
router.delete('/:id', DutyRoleController.delete);

export default router;

