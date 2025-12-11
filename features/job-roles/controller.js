import { JobRoleModel } from './model.js';
import { JobRoleView } from './view.js';

/**
 * Job Role Controller - Handles HTTP requests for job roles
 */
export class JobRoleController {
  /**
   * Get all job roles with pagination and search
   */
  static async getAll(req, res) {
    try {
      // Parse query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      // Parse search parameters
      const searchParams = {};
      if (req.query.jobRoleId !== undefined) {
        const jobRoleId = parseInt(req.query.jobRoleId);
        if (isNaN(jobRoleId)) {
          // Return empty data for invalid jobRoleId
          return res.json(JobRoleView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.jobRoleId = jobRoleId;
      }
      if (req.query.jobRoleCode) {
        searchParams.jobRoleCode = req.query.jobRoleCode;
      }
      if (req.query.jobRoleName) {
        searchParams.jobRoleName = req.query.jobRoleName;
      }
      
      if (req.query.status) {
        const statusUpper = req.query.status.toUpperCase();
        if (['ACTIVE', 'INACTIVE'].includes(statusUpper)) {
          searchParams.status = statusUpper;
        } else {
          return res.status(400).json(
            JobRoleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
          );
        }
      }
      
      // Validate pagination parameters
      if (page < 1) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      // Check if we need all job roles for dropdown
      // Support: ?dropdown=true or ?all=true
      if (req.query.all === 'true' || req.query.dropdown === 'true') {
        // Return all job roles for dropdown without pagination
        // Don't filter by status unless explicitly requested (ensures current value shows in edit mode)
        const jobRoles = await JobRoleModel.getAllForDropdown(searchParams);
        return res.json({
          success: true,
          data: JobRoleView.formatDropdownResponse(jobRoles)
        });
      }
      
      if (limit < 1 || limit > 1000) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Limit must be between 1 and 1000', 400)
        );
      }
      
      // Get data from model
      const result = await JobRoleModel.getAll(page, limit, searchParams);
      
      // Format and send response
      res.json(JobRoleView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(JobRoleView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        JobRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get job role by ID
   */
  static async getById(req, res) {
    try {
      const jobRoleId = parseInt(req.params.id);
      
      if (isNaN(jobRoleId)) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Invalid job role ID', 400)
        );
      }
      
      const jobRoleData = await JobRoleModel.getById(jobRoleId);
      
      if (!jobRoleData) {
        return res.status(404).json(
          JobRoleView.formatErrorResponse('Job role not found', 404)
        );
      }
      
      res.json(JobRoleView.formatSingleResponse(jobRoleData));
    } catch (error) {
      res.status(500).json(
        JobRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new job role
   */
  static async create(req, res) {
    try {
      const {
        jobRoleCode,
        jobRoleName,
        description,
        dutyRolesArray,
        inheritedFromArray,
        status,
        createdBy
      } = req.body;

      // Validate required fields
      if (!jobRoleCode) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('jobRoleCode is required', 400)
        );
      }

      if (!jobRoleName) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('jobRoleName is required', 400)
        );
      }

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Create job role (same pattern as dutyRolesArray for inheritedFromArray)
      const jobRoleData = await JobRoleModel.create({
        jobRoleCode,
        jobRoleName,
        description,
        dutyRolesArray,
        inheritedFromArray,
        status: status || 'ACTIVE',
        createdBy: createdBy || 'SYSTEM'
      });

      res.status(201).json(JobRoleView.formatSingleResponse(jobRoleData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          JobRoleView.formatErrorResponse('Job role code already exists', 409)
        );
      }

      res.status(500).json(
        JobRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Update a job role
   */
  static async update(req, res) {
    try {
      const jobRoleId = parseInt(req.params.id);
      
      if (isNaN(jobRoleId)) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Invalid job role ID', 400)
        );
      }

      const {
        jobRoleCode,
        jobRoleName,
        description,
        dutyRolesArray,
        inheritedFromArray,
        status,
        updatedBy
      } = req.body;

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Update job role
      const jobRoleData = await JobRoleModel.update(jobRoleId, {
        jobRoleCode,
        jobRoleName,
        description,
        dutyRolesArray,
        inheritedFromArray,
        status,
        updatedBy: updatedBy || 'SYSTEM'
      });

      if (!jobRoleData) {
        return res.status(404).json(
          JobRoleView.formatErrorResponse('Job role not found', 404)
        );
      }

      res.json(JobRoleView.formatSingleResponse(jobRoleData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          JobRoleView.formatErrorResponse('Job role code already exists', 409)
        );
      }

      // Handle "cannot remove inherited duty role" error
      if (error.message.includes('Cannot remove inherited duty role')) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse(error.message, 400)
        );
      }

      res.status(500).json(
        JobRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Delete a job role
   */
  static async delete(req, res) {
    try {
      const jobRoleId = parseInt(req.params.id);
      
      if (isNaN(jobRoleId)) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Invalid job role ID', 400)
        );
      }

      const deleted = await JobRoleModel.delete(jobRoleId);

      if (!deleted) {
        return res.status(404).json(
          JobRoleView.formatErrorResponse('Job role not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Job role deleted successfully'
      });
    } catch (error) {
      // Handle "cannot delete because has parents" error
      if (error.message.includes('Cannot delete job role') && error.message.includes('inherits from')) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse(error.message, 400)
        );
      }

      res.status(500).json(
        JobRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Assign one or more duty roles to a job role (additive)
   * @route POST /api/job-roles/:id/duty-roles
   * @body  { dutyRolesArray: number[] } or { dutyRolesArray: string[] }
   */
  static async addDutyRoles(req, res) {
    try {
      const jobRoleId = parseInt(req.params.id, 10);
      
      if (isNaN(jobRoleId)) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Invalid job role ID', 400)
        );
      }

      // Safely destructure req.body
      const body = req.body || {};
      const { dutyRolesArray, updatedBy } = body;

      if (!Array.isArray(dutyRolesArray) || dutyRolesArray.length === 0) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('dutyRolesArray must be a non-empty array', 400)
        );
      }

      const result = await JobRoleModel.addDutyRolesToJobRole(
        jobRoleId,
        dutyRolesArray,
        updatedBy || 'SYSTEM'
      );

      if (!result) {
        return res.status(404).json(
          JobRoleView.formatErrorResponse('Job role not found', 404)
        );
      }

      return res.status(200).json(
        JobRoleView.formatDutyRoleAssignmentResponse(result, dutyRolesArray)
      );
    } catch (error) {
      return res.status(500).json(
        JobRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Remove a single duty role from a job role
   * @route DELETE /api/job-roles/:id/duty-roles/:dutyRoleId
   */
  static async removeDutyRole(req, res) {
    try {
      const jobRoleId = parseInt(req.params.id, 10);
      const dutyRoleId = parseInt(req.params.dutyRoleId, 10);
      const updatedBy = req.body?.updatedBy || 'SYSTEM';

      if (isNaN(jobRoleId)) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Invalid job role ID', 400)
        );
      }

      if (isNaN(dutyRoleId)) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse('Invalid duty role ID', 400)
        );
      }

      const result = await JobRoleModel.removeDutyRoleFromJobRole(
        jobRoleId,
        dutyRoleId,
        updatedBy
      );

      if (!result) {
        return res.status(404).json(
          JobRoleView.formatErrorResponse('Job role not found', 404)
        );
      }

      return res.status(200).json(
        JobRoleView.formatDutyRoleRemovalResponse(result, dutyRoleId)
      );
    } catch (error) {
      // Handle "cannot remove inherited duty role" error
      if (error.message.includes('Cannot remove duty role') && error.message.includes('inherited')) {
        return res.status(400).json(
          JobRoleView.formatErrorResponse(error.message, 400)
        );
      }

      return res.status(500).json(
        JobRoleView.formatErrorResponse(error.message, 500)
      );
    }
  }
}
