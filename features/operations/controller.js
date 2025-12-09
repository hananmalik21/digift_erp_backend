import { OperationModel } from './model.js';
import { OperationView } from './view.js';

/**
 * Operation Controller - Handles HTTP requests for operations
 */
export class OperationController {
  /**
   * Get all operations with pagination and search
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
      if (req.query.operationId !== undefined) {
        const operationId = parseInt(req.query.operationId);
        if (isNaN(operationId)) {
          // Return empty data for invalid operationId
          return res.json(OperationView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.operationId = operationId;
      }
      if (req.query.operationCode) {
        searchParams.operationCode = req.query.operationCode;
      }
      if (req.query.operationName) {
        searchParams.operationName = req.query.operationName;
      }
      
      if (req.query.status) {
        const statusUpper = req.query.status.toUpperCase();
        if (['ACTIVE', 'INACTIVE'].includes(statusUpper)) {
          searchParams.status = statusUpper;
        } else {
          return res.status(400).json(
            OperationView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
          );
        }
      }
      
      // Validate pagination parameters
      if (page < 1) {
        return res.status(400).json(
          OperationView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      // Check if we need all operations for dropdown
      // Support: ?dropdown=true or ?all=true
      if (req.query.all === 'true' || req.query.dropdown === 'true') {
        // Return all operations for dropdown without pagination
        // Don't filter by status unless explicitly requested (ensures current value shows in edit mode)
        const operations = await OperationModel.getAllForDropdown(searchParams);
        return res.json({
          success: true,
          data: OperationView.formatDropdownResponse(operations)
        });
      }
      
      if (limit < 1 || limit > 1000) {
        return res.status(400).json(
          OperationView.formatErrorResponse('Limit must be between 1 and 1000', 400)
        );
      }
      
      // Get data from model
      const result = await OperationModel.getAll(page, limit, searchParams);
      
      // Format and send response
      res.json(OperationView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(OperationView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        OperationView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get operation by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getById(req, res) {
    try {
      const operationId = parseInt(req.params.id);
      
      if (isNaN(operationId)) {
        return res.status(400).json(
          OperationView.formatErrorResponse('Invalid operation ID', 400)
        );
      }
      
      const operationData = await OperationModel.getById(operationId);
      
      if (!operationData) {
        return res.status(404).json(
          OperationView.formatErrorResponse('Operation not found', 404)
        );
      }
      
      res.json(OperationView.formatSingleResponse(operationData));
    } catch (error) {
      res.status(500).json(
        OperationView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new operation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async create(req, res) {
    try {
      const { operationCode, operationName, description, status, createdBy } = req.body;

      // Validate required fields
      if (!operationCode) {
        return res.status(400).json(
          OperationView.formatErrorResponse('operationCode is required', 400)
        );
      }

      if (!operationName) {
        return res.status(400).json(
          OperationView.formatErrorResponse('operationName is required', 400)
        );
      }

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          OperationView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Create operation
      const operationData = await OperationModel.create({
        operationCode,
        operationName,
        description,
        status: status || 'ACTIVE',
        createdBy: createdBy || 'SYSTEM'
      });

      res.status(201).json(OperationView.formatSingleResponse(operationData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          OperationView.formatErrorResponse('Operation code already exists', 409)
        );
      }

      res.status(500).json(
        OperationView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Update an operation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async update(req, res) {
    try {
      const operationId = parseInt(req.params.id);
      
      if (isNaN(operationId)) {
        return res.status(400).json(
          OperationView.formatErrorResponse('Invalid operation ID', 400)
        );
      }

      const { operationCode, operationName, description, status, updatedBy } = req.body;

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          OperationView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Update operation
      const operationData = await OperationModel.update(operationId, {
        operationCode,
        operationName,
        description,
        status,
        updatedBy: updatedBy || 'SYSTEM'
      });

      if (!operationData) {
        return res.status(404).json(
          OperationView.formatErrorResponse('Operation not found', 404)
        );
      }

      res.json(OperationView.formatSingleResponse(operationData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          OperationView.formatErrorResponse('Operation code already exists', 409)
        );
      }

      res.status(500).json(
        OperationView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Delete an operation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    try {
      const operationId = parseInt(req.params.id);
      
      if (isNaN(operationId)) {
        return res.status(400).json(
          OperationView.formatErrorResponse('Invalid operation ID', 400)
        );
      }

      const deleted = await OperationModel.delete(operationId);

      if (!deleted) {
        return res.status(404).json(
          OperationView.formatErrorResponse('Operation not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Operation deleted successfully'
      });
    } catch (error) {
      res.status(500).json(
        OperationView.formatErrorResponse(error.message, 500)
      );
    }
  }
}

