import { DutyRoleModel } from './model.js';
import { DutyRoleView } from './view.js';

/**
 * Duty Role Controller - Handles HTTP requests for duty roles
 */
export class DutyRoleController {
  /**
   * Get all duty roles with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getAll(req, res) {
    try {
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      // Parse search parameters
      const searchParams = {};
      if (req.query.dutyRoleId !== undefined) {
        const dutyRoleId = parseInt(req.query.dutyRoleId);
        if (isNaN(dutyRoleId)) {
          // Return empty data for invalid dutyRoleId
          return res.json(DutyRoleView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.dutyRoleId = dutyRoleId;
      }
      if (req.query.dutyRoleName) {
        searchParams.dutyRoleName = req.query.dutyRoleName;
      }
      if (req.query.roleCode) {
        searchParams.roleCode = req.query.roleCode;
      }
      if (req.query.moduleId !== undefined) {
        const moduleId = parseInt(req.query.moduleId);
        if (isNaN(moduleId)) {
          // Return empty data for invalid moduleId
          return res.json(DutyRoleView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.moduleId = moduleId;
      }
      
      // General search parameter - searches across duty role name, role code, description, and module name
      if (req.query.search) {
        searchParams.search = req.query.search;
      }
      
      if (req.query.status) {
        const statusUpper = req.query.status.toUpperCase();
        if (['ACTIVE', 'INACTIVE'].includes(statusUpper)) {
          searchParams.status = statusUpper;
        } else {
          return res.status(400).json(
            DutyRoleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
          );
        }
      }
      
      // Validate pagination parameters
      if (page < 1) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      if (limit < 1 || limit > 1000) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Limit must be between 1 and 1000', 400)
        );
      }
      
      // Get data from model
      const result = await DutyRoleModel.getAll(page, limit, searchParams);
      
      // Format and send response
      res.json(DutyRoleView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(DutyRoleView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get duty role by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getById(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id);
      
      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }
      
      const dutyRoleData = await DutyRoleModel.getById(dutyRoleId);
      
      if (!dutyRoleData) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }
      
      res.json(DutyRoleView.formatSingleResponse(dutyRoleData));
    } catch (error) {
      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new duty role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async create(req, res) {
    try {
      const { dutyRoleName, roleCode, description, moduleId, functionPrivileges, status, createdBy } = req.body;

      // Validate required fields
      if (!dutyRoleName) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('dutyRoleName is required', 400)
        );
      }

      if (!roleCode) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('roleCode is required', 400)
        );
      }

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Create duty role
      const dutyRoleData = await DutyRoleModel.create({
        dutyRoleName,
        roleCode,
        description,
        moduleId,
        functionPrivileges,
        status: status || 'ACTIVE',
        createdBy: createdBy || 'SYSTEM'
      });

      res.status(201).json(DutyRoleView.formatSingleResponse(dutyRoleData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          DutyRoleView.formatErrorResponse('Role code already exists', 409)
        );
      }

      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Update a duty role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async update(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id);
      
      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      const { dutyRoleName, roleCode, description, moduleId, functionPrivileges, status, updatedBy } = req.body;

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Update duty role
      const dutyRoleData = await DutyRoleModel.update(dutyRoleId, {
        dutyRoleName,
        roleCode,
        description,
        moduleId,
        functionPrivileges,
        status,
        updatedBy: updatedBy || 'SYSTEM'
      });

      if (!dutyRoleData) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }

      res.json(DutyRoleView.formatSingleResponse(dutyRoleData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          DutyRoleView.formatErrorResponse('Role code already exists', 409)
        );
      }

      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Delete a duty role
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id);
      
      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      const deleted = await DutyRoleModel.delete(dutyRoleId);

      if (!deleted) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Duty role deleted successfully'
      });
    } catch (error) {
      res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Assign one or more privileges to a duty role (additive)
   * @route POST /api/duty-roles/:id/privileges
   * @body  { privilegeIds: number[] } or { privilegeIds: string[] }
   */
  static async addPrivileges(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id, 10);
      
      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      // Safely destructure req.body
      const body = req.body || {};
      const { privilegeIds, updatedBy } = body;

      if (!Array.isArray(privilegeIds) || privilegeIds.length === 0) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('privilegeIds must be a non-empty array', 400)
        );
      }

      const result = await DutyRoleModel.addPrivilegesToDutyRole(
        dutyRoleId,
        privilegeIds,
        updatedBy || 'SYSTEM'
      );

      if (!result) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }

      return res.status(200).json(
        DutyRoleView.formatPrivilegeAssignmentResponse(result, privilegeIds)
      );
    } catch (error) {
      return res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Remove a single privilege from a duty role
   * @route DELETE /api/duty-roles/:id/privileges/:privilegeId
   */
  static async removePrivilege(req, res) {
    try {
      const dutyRoleId = parseInt(req.params.id, 10);
      const privilegeId = parseInt(req.params.privilegeId, 10);
      const updatedBy = req.body?.updatedBy || 'SYSTEM';

      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      if (isNaN(privilegeId)) {
        return res.status(400).json(
          DutyRoleView.formatErrorResponse('Invalid privilege ID', 400)
        );
      }

      const result = await DutyRoleModel.removePrivilegeFromDutyRole(
        dutyRoleId,
        privilegeId,
        updatedBy
      );

      if (!result) {
        return res.status(404).json(
          DutyRoleView.formatErrorResponse('Duty role not found', 404)
        );
      }

      return res.status(200).json(
        DutyRoleView.formatPrivilegeRemovalResponse(result, privilegeId)
      );
    } catch (error) {
      return res.status(500).json(
        DutyRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }
}

