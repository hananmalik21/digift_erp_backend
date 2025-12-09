import { ModuleModel } from './model.js';
import { ModuleView } from './view.js';

/**
 * Module Controller - Handles HTTP requests for modules
 */
export class ModuleController {
  /**
   * Get all modules with pagination and search
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
      if (req.query.moduleId !== undefined) {
        const moduleId = parseInt(req.query.moduleId);
        if (isNaN(moduleId)) {
          // Return empty data for invalid moduleId
          return res.json(ModuleView.formatPaginatedResponse({
            data: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }));
        }
        searchParams.moduleId = moduleId;
      }
      if (req.query.moduleCode) {
        searchParams.moduleCode = req.query.moduleCode;
      }
      if (req.query.moduleName) {
        searchParams.moduleName = req.query.moduleName;
      }
      
      if (req.query.status) {
        const statusUpper = req.query.status.toUpperCase();
        if (['ACTIVE', 'INACTIVE'].includes(statusUpper)) {
          searchParams.status = statusUpper;
        } else {
          return res.status(400).json(
            ModuleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
          );
        }
      }
      
      // Validate pagination parameters
      if (page < 1) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('Page number must be greater than 0', 400)
        );
      }
      
      // Check if we need all modules for dropdown
      // Support: ?dropdown=true or ?all=true
      if (req.query.all === 'true' || req.query.dropdown === 'true') {
        // Return all modules for dropdown without pagination
        // Don't filter by status unless explicitly requested (ensures current value shows in edit mode)
        const modules = await ModuleModel.getAllForDropdown(searchParams);
        return res.json({
          success: true,
          data: ModuleView.formatDropdownResponse(modules)
        });
      }
      
      if (limit < 1 || limit > 1000) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('Limit must be between 1 and 1000', 400)
        );
      }
      
      // Get data from model
      const result = await ModuleModel.getAll(page, limit, searchParams);
      
      // Format and send response
      res.json(ModuleView.formatPaginatedResponse(result));
    } catch (error) {
      // If there's a type error (NaN), return empty data instead of error
      if (error.code === 'NJS-105' || error.message.includes('NaN') || error.message.includes('not a number')) {
        return res.json(ModuleView.formatPaginatedResponse({
          data: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0
        }));
      }
      
      res.status(500).json(
        ModuleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Get module by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getById(req, res) {
    try {
      const moduleId = parseInt(req.params.id);
      
      if (isNaN(moduleId)) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('Invalid module ID', 400)
        );
      }
      
      const moduleData = await ModuleModel.getById(moduleId);
      
      if (!moduleData) {
        return res.status(404).json(
          ModuleView.formatErrorResponse('Module not found', 404)
        );
      }
      
      res.json(ModuleView.formatSingleResponse(moduleData));
    } catch (error) {
      res.status(500).json(
        ModuleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Create a new module
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async create(req, res) {
    try {
      const { moduleCode, moduleName, description, status, createdBy } = req.body;

      // Validate required fields
      if (!moduleCode) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('moduleCode is required', 400)
        );
      }

      if (!moduleName) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('moduleName is required', 400)
        );
      }

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Create module
      const moduleData = await ModuleModel.create({
        moduleCode,
        moduleName,
        description,
        status: status || 'ACTIVE',
        createdBy: createdBy || 'SYSTEM'
      });

      res.status(201).json(ModuleView.formatSingleResponse(moduleData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          ModuleView.formatErrorResponse('Module code already exists', 409)
        );
      }

      res.status(500).json(
        ModuleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Update a module
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async update(req, res) {
    try {
      const moduleId = parseInt(req.params.id);
      
      if (isNaN(moduleId)) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('Invalid module ID', 400)
        );
      }

      const { moduleCode, moduleName, description, status, updatedBy } = req.body;

      // Validate status if provided
      if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('status must be ACTIVE or INACTIVE', 400)
        );
      }

      // Update module
      const moduleData = await ModuleModel.update(moduleId, {
        moduleCode,
        moduleName,
        description,
        status,
        updatedBy: updatedBy || 'SYSTEM'
      });

      if (!moduleData) {
        return res.status(404).json(
          ModuleView.formatErrorResponse('Module not found', 404)
        );
      }

      res.json(ModuleView.formatSingleResponse(moduleData));
    } catch (error) {
      // Handle unique constraint violations
      if (error.message.includes('unique constraint') || error.errorNum === 1) {
        return res.status(409).json(
          ModuleView.formatErrorResponse('Module code already exists', 409)
        );
      }

      res.status(500).json(
        ModuleView.formatErrorResponse(error.message, 500)
      );
    }
  }

  /**
   * Delete a module
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    try {
      const moduleId = parseInt(req.params.id);
      
      if (isNaN(moduleId)) {
        return res.status(400).json(
          ModuleView.formatErrorResponse('Invalid module ID', 400)
        );
      }

      const deleted = await ModuleModel.delete(moduleId);

      if (!deleted) {
        return res.status(404).json(
          ModuleView.formatErrorResponse('Module not found', 404)
        );
      }

      res.json({
        success: true,
        message: 'Module deleted successfully'
      });
    } catch (error) {
      res.status(500).json(
        ModuleView.formatErrorResponse(error.message, 500)
      );
    }
  }
}

