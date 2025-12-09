import { FunctionPrivilegeModel } from './model.js';
import { FunctionPrivilegeView } from './view.js';

/**
 * Function Privilege Controller - Handles HTTP requests for function privileges
 */
export class FunctionPrivilegeController {
  /**
   * Get all function privileges with pagination and search
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
      if (req.query.privilegeId !== undefined) {
        const privilegeId = parseInt(req.query.privilegeId);
        if (isNaN(privilegeId)) {
          // Return empty data for invalid privilegeId
          return res.json(FunctionPrivilegeView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.privilegeId = privilegeId;
      }
      if (req.query.privilegeCode) {
        searchParams.privilegeCode = req.query.privilegeCode;
      }
      if (req.query.privilegeName) {
        searchParams.privilegeName = req.query.privilegeName;
      }
      if (req.query.moduleId !== undefined) {
        const moduleId = parseInt(req.query.moduleId);
        if (isNaN(moduleId)) {
          // Return empty data for invalid moduleId
          return res.json(FunctionPrivilegeView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.moduleId = moduleId;
      }
      if (req.query.functionId !== undefined) {
        const functionId = parseInt(req.query.functionId);
        if (isNaN(functionId)) {
          // Return empty data for invalid functionId
          return res.json(FunctionPrivilegeView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.functionId = functionId;
      }
      if (req.query.operationId !== undefined) {
        const operationId = parseInt(req.query.operationId);
        if (isNaN(operationId)) {
          // Return empty data for invalid operationId
          return res.json(FunctionPrivilegeView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.operationId = operationId;
      }
      
      // General search parameter - searches across privilege name, code, description, and function name
      if (req.query.search) {
        searchParams.search = req.query.search;
      }
      
      if (req.query.status) {
        const statusUpper = req.query.status.toUpperCase();
        if (['ACTIVE', 'INACTIVE'].includes(statusUpper)) {
          searchParams.status = statusUpper;
        } else {
          return res.status(400).json(
            FunctionPrivilegeView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
          );
        }
      }
      
      // Validate pagination parameters
      if (page < 1) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      if (limit < 1 || limit > 1000) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('Limit must be between 1 and 1000', 400)
        );
      }
      
      // Get data from model
      const result = await FunctionPrivilegeModel.getAll(page, limit, searchParams);
      
      // Format and send response
      res.json(FunctionPrivilegeView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(FunctionPrivilegeView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        FunctionPrivilegeView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get function privilege by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getById(req, res) {
    try {
      const privilegeId = parseInt(req.params.id);
      
      if (isNaN(privilegeId)) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('Invalid privilege ID', 400)
        );
      }
      
      const privilegeData = await FunctionPrivilegeModel.getById(privilegeId);
      
      if (!privilegeData) {
        return res.status(404).json(
          FunctionPrivilegeView.formatErrorResponse('Function privilege not found', 404)
        );
      }
      
      res.json(FunctionPrivilegeView.formatSingleResponse(privilegeData));
    } catch (error) {
      res.status(500).json(
        FunctionPrivilegeView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new function privilege
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async create(req, res) {
    try {
      const { privilegeCode, privilegeName, description, moduleId, functionId, operationId, status, createdBy } = req.body;

      // Validate required fields
      if (!privilegeCode) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('privilegeCode is required', 400)
        );
      }

      if (!privilegeName) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('privilegeName is required', 400)
        );
      }

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Create function privilege
      const privilegeData = await FunctionPrivilegeModel.create({
        privilegeCode,
        privilegeName,
        description,
        moduleId,
        functionId,
        operationId,
        status: status || 'ACTIVE',
        createdBy: createdBy || 'SYSTEM'
      });

      res.status(201).json(FunctionPrivilegeView.formatSingleResponse(privilegeData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          FunctionPrivilegeView.formatErrorResponse('Privilege code already exists', 409)
        );
      }

      res.status(500).json(
        FunctionPrivilegeView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Update a function privilege
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async update(req, res) {
    try {
      const privilegeId = parseInt(req.params.id);
      
      if (isNaN(privilegeId)) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('Invalid privilege ID', 400)
        );
      }

      const { privilegeCode, privilegeName, description, moduleId, functionId, operationId, status, updatedBy } = req.body;

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Update function privilege
      const privilegeData = await FunctionPrivilegeModel.update(privilegeId, {
        privilegeCode,
        privilegeName,
        description,
        moduleId,
        functionId,
        operationId,
        status,
        updatedBy: updatedBy || 'SYSTEM'
      });

      if (!privilegeData) {
        return res.status(404).json(
          FunctionPrivilegeView.formatErrorResponse('Function privilege not found', 404)
        );
      }

      res.json(FunctionPrivilegeView.formatSingleResponse(privilegeData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          FunctionPrivilegeView.formatErrorResponse('Privilege code already exists', 409)
        );
      }

      res.status(500).json(
        FunctionPrivilegeView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Delete a function privilege
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    try {
      const privilegeId = parseInt(req.params.id);
      
      if (isNaN(privilegeId)) {
        return res.status(400).json(
          FunctionPrivilegeView.formatErrorResponse('Invalid privilege ID', 400)
        );
      }

      const deleted = await FunctionPrivilegeModel.delete(privilegeId);

      if (!deleted) {
        return res.status(404).json(
          FunctionPrivilegeView.formatErrorResponse('Function privilege not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Function privilege deleted successfully'
      });
    } catch (error) {
      res.status(500).json(
        FunctionPrivilegeView.formatErrorResponse(error.message, 500)
      );
    }
  }
}

