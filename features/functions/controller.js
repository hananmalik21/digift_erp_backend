import { FunctionModel } from './model.js';
import { FunctionView } from './view.js';

/**
 * Function Controller - Handles HTTP requests for functions
 */
export class FunctionController {
  /**
   * Get all functions with pagination and search
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
      if (req.query.functionId !== undefined) {
        const functionId = parseInt(req.query.functionId);
        if (isNaN(functionId)) {
          // Return empty data for invalid functionId
          return res.json(FunctionView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.functionId = functionId;
      }
      if (req.query.moduleId !== undefined) {
        const moduleId = parseInt(req.query.moduleId);
        if (isNaN(moduleId)) {
          // Return empty data for invalid moduleId
          return res.json(FunctionView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.moduleId = moduleId;
      }
      if (req.query.functionCode) {
        searchParams.functionCode = req.query.functionCode;
      }
      if (req.query.functionName) {
        searchParams.functionName = req.query.functionName;
      }
      
      if (req.query.status) {
        const statusUpper = req.query.status.toUpperCase();
        if (['ACTIVE', 'INACTIVE'].includes(statusUpper)) {
          searchParams.status = statusUpper;
        } else {
          return res.status(400).json(
            FunctionView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
          );
        }
      }
      
      // Validate pagination parameters
      if (page < 1) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      if (limit < 1 || limit > 100) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Limit must be between 1 and 100', 400)
        );
      }
      
      // Get data from model
      const result = await FunctionModel.getAll(page, limit, searchParams);
      
      // Format and send response
      res.json(FunctionView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(FunctionView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        FunctionView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get function by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getById(req, res) {
    try {
      const functionId = parseInt(req.params.id);
      
      if (isNaN(functionId)) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Invalid function ID', 400)
        );
      }
      
      const functionData = await FunctionModel.getById(functionId);
      
      if (!functionData) {
        return res.status(404).json(
          FunctionView.formatErrorResponse('Function not found', 404)
        );
      }
      
      res.json(FunctionView.formatSingleResponse(functionData));
    } catch (error) {
      res.status(500).json(
        FunctionView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get functions by module ID with pagination and search
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getByModuleId(req, res) {
    try {
      const moduleId = parseInt(req.params.moduleId);
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      // Parse additional search parameters
      const searchParams = {};
      if (req.query.functionId !== undefined) {
        const functionId = parseInt(req.query.functionId);
        if (isNaN(functionId)) {
          // Return empty data for invalid functionId
          return res.json(FunctionView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.functionId = functionId;
      }
      if (req.query.functionCode) {
        searchParams.functionCode = req.query.functionCode;
      }
      if (req.query.functionName) {
        searchParams.functionName = req.query.functionName;
      }
      
      if (isNaN(moduleId)) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Invalid module ID', 400)
        );
      }
      
      if (page < 1) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      if (limit < 1 || limit > 100) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Limit must be between 1 and 100', 400)
        );
      }
      
      const result = await FunctionModel.getByModuleId(moduleId, page, limit, searchParams);
      
      res.json(FunctionView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(FunctionView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        FunctionView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new function
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async create(req, res) {
    try {
      const { moduleId, functionCode, functionName, description, status, createdBy } = req.body;

      // Validate required fields
      if (!moduleId) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('moduleId is required', 400)
        );
      }

      if (!functionCode) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('functionCode is required', 400)
        );
      }

      if (!functionName) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('functionName is required', 400)
        );
      }

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Create function
      const functionData = await FunctionModel.create({
        moduleId,
        functionCode,
        functionName,
        description,
        status: status || 'ACTIVE',
        createdBy: createdBy || 'SYSTEM'
      });

      res.status(201).json(FunctionView.formatSingleResponse(functionData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          FunctionView.formatErrorResponse('Function code already exists', 409)
        );
      }

      res.status(500).json(
        FunctionView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Update a function
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async update(req, res) {
    try {
      const functionId = parseInt(req.params.id);
      
      if (isNaN(functionId)) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Invalid function ID', 400)
        );
      }

      const { moduleId, functionCode, functionName, description, status, updatedBy } = req.body;

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Update function
      const functionData = await FunctionModel.update(functionId, {
        moduleId,
        functionCode,
        functionName,
        description,
        status,
        updatedBy: updatedBy || 'SYSTEM'
      });

      if (!functionData) {
        return res.status(404).json(
          FunctionView.formatErrorResponse('Function not found', 404)
        );
      }

      res.json(FunctionView.formatSingleResponse(functionData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          FunctionView.formatErrorResponse('Function code already exists', 409)
        );
      }

      res.status(500).json(
        FunctionView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Delete a function
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    try {
      const functionId = parseInt(req.params.id);
      
      if (isNaN(functionId)) {
        return res.status(400).json(
          FunctionView.formatErrorResponse('Invalid function ID', 400)
        );
      }

      const deleted = await FunctionModel.delete(functionId);

      if (!deleted) {
        return res.status(404).json(
          FunctionView.formatErrorResponse('Function not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Function deleted successfully'
      });
    } catch (error) {
      res.status(500).json(
        FunctionView.formatErrorResponse(error.message, 500)
      );
    }
  }
}

